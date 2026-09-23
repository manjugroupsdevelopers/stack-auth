import { getAuthContactChannel } from "@/lib/contact-channel";
import { sendOtpSms } from "@/lib/sms";
import { getSoleTenancyFromProjectBranch, Tenancy } from "@/lib/tenancies";
import { createAuthTokens } from "@/lib/tokens";
import { createOrUpgradeAnonymousUserWithRules } from "@/lib/users";
import { getPrismaClientForTenancy } from "@/prisma-client";
import { globalPrismaClient } from "@/prisma-client";
import { createVerificationCodeHandler } from "@/route-handlers/verification-code-handler";
import { BooleanTrue, VerificationCodeType } from "@/generated/prisma/client";
import { KnownErrors } from "@stackframe/stack-shared";
import { UsersCrud } from "@stackframe/stack-shared/dist/interface/crud/users";
import { phoneNumberSchema, signInResponseSchema, yupNumber, yupObject, yupString } from "@stackframe/stack-shared/dist/schema-fields";
import { getEnvVariable } from "@stackframe/stack-shared/dist/utils/env";
import { StackAssertionError } from "@stackframe/stack-shared/dist/utils/errors";
import { usersCrudHandlers } from "../../../users/crud";
import { createMfaRequiredError } from "../../mfa/sign-in/verification-code-handler";

export async function ensureUserForPhoneAllowsOtp(tenancy: Tenancy, phone: string): Promise<UsersCrud["Admin"]["Read"] | null> {
  const prisma = await getPrismaClientForTenancy(tenancy);
  const contactChannel = await getAuthContactChannel(prisma, {
    tenancyId: tenancy.id,
    type: "PHONE",
    value: phone,
  });

  if (contactChannel) {
    const otpAuthMethod = contactChannel.projectUser.authMethods.find((m) => m.otpAuthMethod)?.otpAuthMethod;

    if (!otpAuthMethod) {
      await prisma.authMethod.create({
        data: {
          projectUserId: contactChannel.projectUser.projectUserId,
          tenancyId: tenancy.id,
          otpAuthMethod: {
            create: {
              projectUserId: contactChannel.projectUser.projectUserId,
            }
          }
        },
      });
    }

    return await usersCrudHandlers.adminRead({
      tenancy,
      user_id: contactChannel.projectUser.projectUserId,
    });
  } else {
    if (!tenancy.config.auth.allowSignUp) {
      throw new KnownErrors.SignUpNotEnabled();
    }
    return null;
  }
}

function generateNumericOtp(length: number): string {
  const digits = "0123456789";
  let otp = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    otp += digits[randomValues[i] % 10];
  }
  return otp;
}

function validatePhoneOtp(otp: string): void {
  const otpLength = getPhoneOtpLength();
  if (!otp.match(new RegExp(`^\\d{${otpLength}}$`))) {
    throw new StackAssertionError(`Phone OTP must be exactly ${otpLength} digits`);
  }
}

function getPhoneOtpLength(): number {
  const rawOtpLength = getEnvVariable("STACK_PHONE_OTP_LENGTH", "6");
  const otpLength = Number(rawOtpLength);
  if (!Number.isInteger(otpLength) || otpLength < 4 || otpLength > 8) {
    throw new StackAssertionError("STACK_PHONE_OTP_LENGTH must be an integer between 4 and 8");
  }
  return otpLength;
}

type PhoneOtpCodeObject = {
  code: string,
};

type PhoneOtpDeliveryOptions = {
  project: {
    id: string,
  },
  branchId: string,
  method: {
    phone: string,
  },
};

export async function deliverPhoneSignInCode(codeObj: PhoneOtpCodeObject, createOptions: PhoneOtpDeliveryOptions): Promise<{ nonce: string }> {
  const otpLength = getPhoneOtpLength();
  const numericOtp = generateNumericOtp(otpLength);
  validatePhoneOtp(numericOtp);
  const nonce = codeObj.code.slice(otpLength);
  const newCode = numericOtp + nonce;

  await globalPrismaClient.verificationCode.update({
    where: {
      projectId_branchId_code: {
        projectId: createOptions.project.id,
        branchId: createOptions.branchId,
        code: codeObj.code,
      },
    },
    data: {
      code: newCode,
    },
  });

  await sendOtpSms({
    phoneNumber: createOptions.method.phone,
    otp: numericOtp,
  });

  return {
    nonce,
  };
}

export const phoneSignInVerificationCodeHandler = createVerificationCodeHandler({
  metadata: {
    post: {
      summary: "Sign in with phone OTP code",
      description: "Verify a phone OTP code and sign in",
      tags: ["Phone OTP"],
    },
    check: {
      summary: "Check phone OTP code",
      description: "Check if a phone OTP code is valid without using it",
      tags: ["Phone OTP"],
    },
    codeDescription: "A verification code formed by concatenating the numeric OTP with the nonce received during code creation",
  },
  type: VerificationCodeType.PHONE_OTP,
  data: yupObject({}),
  method: yupObject({
    phone: phoneNumberSchema.defined(),
  }),
  response: yupObject({
    statusCode: yupNumber().oneOf([200]).defined(),
    bodyType: yupString().oneOf(["json"]).defined(),
    body: signInResponseSchema.defined(),
  }),
  async send(codeObj, createOptions) {
    return await deliverPhoneSignInCode(codeObj, createOptions);
  },
  async handler(tenancy, { phone }, data, requestBody, currentUser) {
    let user = await ensureUserForPhoneAllowsOtp(tenancy, phone);
    let isNewUser = false;

    if (!user) {
      user = await createOrUpgradeAnonymousUserWithRules(
        tenancy,
        currentUser ?? null,
        {
          otp_auth_enabled: true,
        },
        [],
        {
          authMethod: 'otp',
        }
      );
      isNewUser = true;

      // Create phone contact channel for the new user
      const prisma = await getPrismaClientForTenancy(tenancy);
      await prisma.contactChannel.create({
        data: {
          tenancyId: tenancy.id,
          projectUserId: user.id,
          type: "PHONE",
          value: phone,
          isPrimary: BooleanTrue.TRUE,
          usedForAuth: BooleanTrue.TRUE,
          isVerified: true,
        },
      });
    }

    if (user.requires_totp_mfa) {
      throw await createMfaRequiredError({
        project: tenancy.project,
        branchId: tenancy.branchId,
        userId: user.id,
        isNewUser,
      });
    }

    const { refreshToken, accessToken } = await createAuthTokens({
      tenancy,
      projectUserId: user.id,
    });

    return {
      statusCode: 200,
      bodyType: "json",
      body: {
        refresh_token: refreshToken,
        access_token: accessToken,
        is_new_user: isNewUser,
        user_id: user.id,
      },
    };
  },
});
