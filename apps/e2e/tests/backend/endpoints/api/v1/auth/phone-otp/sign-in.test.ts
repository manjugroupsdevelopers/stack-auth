import { it } from "../../../../../../helpers";
import { Auth, ContactChannels, Project, niceBackendFetch } from "../../../../../backend-helpers";

it("should sign up new users and sign in existing users with phone OTP", async ({ expect }) => {
  const phone = Auth.PhoneOtp.createPhoneNumber();

  const res1 = await Auth.PhoneOtp.signIn(phone);
  expect(res1.signInResponse).toMatchInlineSnapshot(`
    NiceResponse {
      "status": 200,
      "body": {
        "access_token": <stripped field 'access_token'>,
        "is_new_user": true,
        "refresh_token": <stripped field 'refresh_token'>,
        "user_id": "<stripped UUID>",
      },
      "headers": Headers { <some fields may have been hidden> },
    }
  `);

  const contactChannels = await ContactChannels.listAllCurrentUserContactChannels();
  expect(contactChannels).toHaveLength(1);
  expect(contactChannels[0]).toMatchObject({
    is_primary: true,
    is_verified: true,
    type: "phone",
    used_for_auth: true,
    value: phone,
  });

  await Auth.signOut();

  const res2 = await Auth.PhoneOtp.signIn(phone);
  expect(res2.signInResponse).toMatchInlineSnapshot(`
    NiceResponse {
      "status": 200,
      "body": {
        "access_token": <stripped field 'access_token'>,
        "is_new_user": false,
        "refresh_token": <stripped field 'refresh_token'>,
        "user_id": "<stripped UUID>",
      },
      "headers": Headers { <some fields may have been hidden> },
    }
  `);
});

it("should sign in users created with the server API even if sign up is disabled", async ({ expect }) => {
  const phone = Auth.PhoneOtp.createPhoneNumber();
  await Project.createAndSwitch({ config: { sign_up_enabled: false, magic_link_enabled: true } });

  const createUserResponse = await niceBackendFetch("/api/v1/users", {
    accessType: "server",
    method: "POST",
    body: {},
  });
  expect(createUserResponse.status).toBe(201);

  const createContactChannelResponse = await niceBackendFetch("/api/v1/contact-channels", {
    accessType: "server",
    method: "POST",
    body: {
      user_id: createUserResponse.body.id,
      type: "phone",
      value: phone,
      used_for_auth: true,
      is_primary: true,
      is_verified: true,
    },
  });
  expect(createContactChannelResponse.status).toBe(201);

  const res = await Auth.PhoneOtp.signIn(phone);
  expect(res.signInResponse).toMatchInlineSnapshot(`
    NiceResponse {
      "status": 200,
      "body": {
        "access_token": <stripped field 'access_token'>,
        "is_new_user": false,
        "refresh_token": <stripped field 'refresh_token'>,
        "user_id": "<stripped UUID>",
      },
      "headers": Headers { <some fields may have been hidden> },
    }
  `);
});

it("should refuse to send phone OTP if OTP sign-in is disabled", async ({ expect }) => {
  await Project.createAndSwitch({ config: { magic_link_enabled: false } });
  const response = await niceBackendFetch("/api/v1/auth/phone-otp/send-code", {
    method: "POST",
    accessType: "client",
    body: {
      phone: Auth.PhoneOtp.createPhoneNumber(),
    },
  });
  expect(response).toMatchInlineSnapshot(`
    NiceResponse {
      "status": 403,
      "body": "OTP sign-in is not enabled for this project",
      "headers": Headers { <some fields may have been hidden> },
    }
  `);
});

it("should refuse to sign up a new phone user if sign ups are disabled", async ({ expect }) => {
  await Project.createAndSwitch({ config: { sign_up_enabled: false, credential_enabled: false, magic_link_enabled: true } });
  const response = await niceBackendFetch("/api/v1/auth/phone-otp/send-code", {
    method: "POST",
    accessType: "client",
    body: {
      phone: Auth.PhoneOtp.createPhoneNumber(),
    },
  });
  expect(response).toMatchInlineSnapshot(`
    NiceResponse {
      "status": 400,
      "body": {
        "code": "SIGN_UP_NOT_ENABLED",
        "error": "Creation of new accounts is not enabled for this project. Please ask the project owner to enable it.",
      },
      "headers": Headers {
        "x-stack-known-error": "SIGN_UP_NOT_ENABLED",
        <some fields may have been hidden>,
      },
    }
  `);
});

it("should not sign in if phone OTP code is invalid", async ({ expect }) => {
  const phone = Auth.PhoneOtp.createPhoneNumber();
  const sendSignInCodeResponse = await Auth.PhoneOtp.sendSignInCode(phone);
  const otp = await Auth.PhoneOtp.getOtpFromSmsOutbox(phone);
  const invalidOtp = `${otp[0] === "0" ? "1" : "0"}${otp.slice(1)}`;

  const signInResponse = await niceBackendFetch("/api/v1/auth/phone-otp/sign-in", {
    method: "POST",
    accessType: "client",
    body: {
      code: `${invalidOtp}${sendSignInCodeResponse.sendSignInCodeResponse.body.nonce}`,
    },
  });

  expect(signInResponse).toMatchInlineSnapshot(`
    NiceResponse {
      "status": 404,
      "body": {
        "code": "VERIFICATION_CODE_NOT_FOUND",
        "error": "The verification code does not exist for this project.",
      },
      "headers": Headers {
        "x-stack-known-error": "VERIFICATION_CODE_NOT_FOUND",
        <some fields may have been hidden>,
      },
    }
  `);
});
