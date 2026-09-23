import { createSmartRouteHandler } from "@/route-handlers/smart-route-handler";
import { adaptSchema, clientOrHigherAuthTypeSchema, phoneNumberSchema, yupNumber, yupObject, yupString } from "@stackframe/stack-shared/dist/schema-fields";
import { StatusError } from "@stackframe/stack-shared/dist/utils/errors";
import { deliverPhoneSignInCode, ensureUserForPhoneAllowsOtp, phoneSignInVerificationCodeHandler } from "../sign-in/verification-code-handler";

export const POST = createSmartRouteHandler({
  metadata: {
    summary: "Send phone OTP code",
    description: "Send an OTP code to the user's phone number for sign-in via SMS.",
    tags: ["Phone OTP"],
  },
  request: yupObject({
    auth: yupObject({
      type: clientOrHigherAuthTypeSchema,
      tenancy: adaptSchema,
    }).defined(),
    body: yupObject({
      phone: phoneNumberSchema.defined(),
    }).defined(),
  }),
  response: yupObject({
    statusCode: yupNumber().oneOf([200]).defined(),
    bodyType: yupString().oneOf(["json"]).defined(),
    body: yupObject({
      nonce: yupString().defined().meta({ openapiField: { description: "A token that must be stored temporarily and provided after the numeric OTP when verifying the phone OTP code", exampleValue: "u3h6gn4w24pqc8ya679inrhjwh1rybth6a7thurqhnpf2" } }),
    }).defined(),
  }),
  async handler({ auth: { tenancy }, body: { phone } }) {
    if (!tenancy.config.auth.otp.allowSignIn) {
      throw new StatusError(StatusError.Forbidden, "OTP sign-in is not enabled for this project");
    }

    await ensureUserForPhoneAllowsOtp(tenancy, phone);

    const codeObj = await phoneSignInVerificationCodeHandler.createCode({
      tenancy,
      callbackUrl: undefined,
      method: { phone },
      data: {},
      expiresInMs: 10 * 60 * 1000, // 10 minutes
    });
    const { nonce } = await deliverPhoneSignInCode(codeObj, {
      project: tenancy.project,
      branchId: tenancy.branchId,
      method: { phone },
    });

    return {
      statusCode: 200,
      bodyType: "json",
      body: { nonce },
    };
  },
});
