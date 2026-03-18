import { generateSecureRandomString } from "@stackframe/stack-shared/dist/utils/crypto";
import { describe } from "vitest";
import { it } from "../../../../helpers";
import { Auth, InternalApiKey, Project, backendContext, niceBackendFetch } from "../../../backend-helpers";

describe("blocked emails", () => {
  it("should create and list a blocked email", async ({ expect }) => {
    await Project.createAndSwitch({
      config: {
        credential_enabled: true,
      },
    });

    const response = await niceBackendFetch("/api/v1/blocked-emails", {
      accessType: "admin",
      method: "POST",
      body: {
        email: "Blocked.User@example.com",
        public_reason: "Blocked for abuse",
        private_details: "Raised by support",
      },
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      email: "blocked.user@example.com",
      public_reason: "Blocked for abuse",
      private_details: "Raised by support",
    });

    const listResponse = await niceBackendFetch("/api/v1/blocked-emails?email=blocked.user@example.com", {
      accessType: "admin",
    });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toMatchObject([
      {
        email: "blocked.user@example.com",
        public_reason: "Blocked for abuse",
      },
    ]);
  });

  it("should immediately restrict an existing user and clear that restriction when unblocked", async ({ expect }) => {
    await Project.createAndSwitch({
      config: {
        credential_enabled: true,
      },
    });

    const userResponse = await niceBackendFetch("/api/v1/users", {
      accessType: "server",
      method: "POST",
      body: {
        primary_email: "current-user@example.com",
        primary_email_auth_enabled: true,
        primary_email_verified: true,
      },
    });

    const blockResponse = await niceBackendFetch("/api/v1/blocked-emails", {
      accessType: "admin",
      method: "POST",
      body: {
        email: "current-user@example.com",
        public_reason: "Blocked by admin",
      },
    });

    expect(blockResponse.status).toBe(201);

    const afterBlock = await niceBackendFetch(`/api/v1/users/${userResponse.body.id}`, {
      accessType: "server",
    });

    expect(afterBlock.body).toMatchObject({
      restricted_by_admin: true,
      restricted_by_admin_reason: "Blocked by admin",
      is_restricted: true,
      restricted_reason: { type: "restricted_by_administrator" },
    });

    const unblockResponse = await niceBackendFetch(`/api/v1/blocked-emails/${blockResponse.body.id}`, {
      accessType: "admin",
      method: "DELETE",
    });

    expect(unblockResponse.status).toBe(200);

    const afterUnblock = await niceBackendFetch(`/api/v1/users/${userResponse.body.id}`, {
      accessType: "server",
    });

    expect(afterUnblock.body).toMatchObject({
      restricted_by_admin: false,
      restricted_by_admin_reason: null,
      is_restricted: false,
      restricted_reason: null,
    });
  });

  it("should preserve unrelated admin restriction when unblocked", async ({ expect }) => {
    await Project.createAndSwitch({
      config: {
        credential_enabled: true,
      },
    });

    const userResponse = await niceBackendFetch("/api/v1/users", {
      accessType: "server",
      method: "POST",
      body: {
        primary_email: "already-restricted@example.com",
        primary_email_auth_enabled: true,
        primary_email_verified: true,
        restricted_by_admin: true,
        restricted_by_admin_reason: "Manual restriction",
        restricted_by_admin_private_details: "Some unrelated private details",
      },
    });

    const blockResponse = await niceBackendFetch("/api/v1/blocked-emails", {
      accessType: "admin",
      method: "POST",
      body: {
        email: "already-restricted@example.com",
        public_reason: "Blocked email reason",
      },
    });

    await niceBackendFetch(`/api/v1/blocked-emails/${blockResponse.body.id}`, {
      accessType: "admin",
      method: "DELETE",
    });

    const afterUnblock = await niceBackendFetch(`/api/v1/users/${userResponse.body.id}`, {
      accessType: "server",
    });

    expect(afterUnblock.body).toMatchObject({
      restricted_by_admin: true,
      restricted_by_admin_reason: "Manual restriction",
      is_restricted: true,
      restricted_reason: { type: "restricted_by_administrator" },
    });
  });

  it("should preserve onboarding restriction when unblocked", async ({ expect }) => {
    await Project.createAndSwitch({
      config: {
        credential_enabled: true,
      },
    });
    await Project.updateConfig({
      onboarding: { requireEmailVerification: true },
    });

    const userResponse = await niceBackendFetch("/api/v1/users", {
      accessType: "server",
      method: "POST",
      body: {
        primary_email: "needs-verification@example.com",
        primary_email_auth_enabled: true,
        primary_email_verified: false,
      },
    });

    const blockResponse = await niceBackendFetch("/api/v1/blocked-emails", {
      accessType: "admin",
      method: "POST",
      body: {
        email: "needs-verification@example.com",
      },
    });

    await niceBackendFetch(`/api/v1/blocked-emails/${blockResponse.body.id}`, {
      accessType: "admin",
      method: "DELETE",
    });

    const afterUnblock = await niceBackendFetch(`/api/v1/users/${userResponse.body.id}`, {
      accessType: "server",
    });

    expect(afterUnblock.body).toMatchObject({
      restricted_by_admin: false,
      is_restricted: true,
      restricted_reason: { type: "email_not_verified" },
    });
  });

  it("should reject password signup for a blocked email", async ({ expect }) => {
    await Project.createAndSwitch({
      config: {
        credential_enabled: true,
      },
    });

    await niceBackendFetch("/api/v1/blocked-emails", {
      accessType: "admin",
      method: "POST",
      body: {
        email: "password-blocked@example.com",
        public_reason: "Password signups disabled for this email",
      },
    });

    const response = await niceBackendFetch("/api/v1/auth/password/sign-up", {
      accessType: "client",
      method: "POST",
      body: {
        email: "password-blocked@example.com",
        password: generateSecureRandomString(),
      },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "BLOCKED_EMAIL_SIGN_UP_NOT_ALLOWED",
      error: "Password signups disabled for this email",
    });
  });

  it("should reject OTP signup for a blocked email", async ({ expect }) => {
    await Project.createAndSwitch({
      config: {
        magic_link_enabled: true,
      },
    });

    await niceBackendFetch("/api/v1/blocked-emails", {
      accessType: "admin",
      method: "POST",
      body: {
        email: backendContext.value.mailbox.emailAddress,
      },
    });

    const sendCodeResponse = await Auth.Otp.sendSignInCode();
    const response = await niceBackendFetch("/api/v1/auth/otp/sign-in", {
      accessType: "client",
      method: "POST",
      body: {
        code: await Auth.Otp.getSignInCodeFromMailbox(sendCodeResponse.sendSignInCodeResponse.body.nonce),
      },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "BLOCKED_EMAIL_SIGN_UP_NOT_ALLOWED",
    });
  });

  it("should reject OAuth signup for a blocked email", async ({ expect }) => {
    await Project.createAndSwitch({
      config: {
        oauth_providers: [{ id: "spotify", type: "shared" }],
      },
    });
    await InternalApiKey.createAndSetProjectKeys();

    await niceBackendFetch("/api/v1/blocked-emails", {
      accessType: "admin",
      method: "POST",
      body: {
        email: backendContext.value.mailbox.emailAddress,
      },
    });

    const { response } = await Auth.OAuth.getMaybeFailingAuthorizationCode();
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "BLOCKED_EMAIL_SIGN_UP_NOT_ALLOWED",
    });
  });

  it("should reject anonymous upgrade for a blocked email", async ({ expect }) => {
    await Project.createAndSwitch({
      config: {
        credential_enabled: true,
      },
    });

    await niceBackendFetch("/api/v1/blocked-emails", {
      accessType: "admin",
      method: "POST",
      body: {
        email: "anon-blocked@example.com",
      },
    });

    const anonymousSignUp = await niceBackendFetch("/api/v1/auth/anonymous/sign-up", {
      accessType: "client",
      method: "POST",
      body: {},
    });

    const response = await niceBackendFetch("/api/v1/auth/password/sign-up", {
      accessType: "client",
      method: "POST",
      headers: {
        "x-stack-access-token": anonymousSignUp.body.access_token,
      },
      body: {
        email: "anon-blocked@example.com",
        password: generateSecureRandomString(),
      },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "BLOCKED_EMAIL_SIGN_UP_NOT_ALLOWED",
    });
  });

  it("should keep blocked email active after deleting the original user", async ({ expect }) => {
    await Project.createAndSwitch({
      config: {
        credential_enabled: true,
      },
    });

    const userResponse = await niceBackendFetch("/api/v1/users", {
      accessType: "server",
      method: "POST",
      body: {
        primary_email: "persist-after-delete@example.com",
        primary_email_auth_enabled: true,
        primary_email_verified: true,
      },
    });

    await niceBackendFetch("/api/v1/blocked-emails", {
      accessType: "admin",
      method: "POST",
      body: {
        email: "persist-after-delete@example.com",
      },
    });

    await niceBackendFetch(`/api/v1/users/${userResponse.body.id}`, {
      accessType: "server",
      method: "DELETE",
    });

    const response = await niceBackendFetch("/api/v1/auth/password/sign-up", {
      accessType: "client",
      method: "POST",
      body: {
        email: "persist-after-delete@example.com",
        password: generateSecureRandomString(),
      },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "BLOCKED_EMAIL_SIGN_UP_NOT_ALLOWED",
    });
  });

  it("should normalize blocked emails consistently", async ({ expect }) => {
    await Project.createAndSwitch({
      config: {
        credential_enabled: true,
      },
    });

    await niceBackendFetch("/api/v1/blocked-emails", {
      accessType: "admin",
      method: "POST",
      body: {
        email: "Example.Blocked@Example.com",
      },
    });

    const response = await niceBackendFetch("/api/v1/auth/password/sign-up", {
      accessType: "client",
      method: "POST",
      body: {
        email: "example.blocked@example.com",
        password: generateSecureRandomString(),
      },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "BLOCKED_EMAIL_SIGN_UP_NOT_ALLOWED",
    });
  });
});
