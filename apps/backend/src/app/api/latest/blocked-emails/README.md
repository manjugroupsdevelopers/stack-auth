# Blocked Emails API

This document explains how to use the blocked-email admin APIs, the SDK helpers, and what runtime behavior they trigger.

## Overview

Blocked emails are stored per tenancy (project + branch + org context). Blocking an email does two things:

1. Prevents future signup/upgrade flows for that normalized email.
2. Immediately applies an admin restriction to the current user if a user already exists with that email.

Unblocking removes the block entry and removes only the restriction marker added by this feature.

## Endpoints

All routes below are admin-only:

- `GET /api/v1/blocked-emails`
- `POST /api/v1/blocked-emails`
- `DELETE /api/v1/blocked-emails/{blocked_email_id}`

The route implementation lives in:

- [`./crud.tsx`](./crud.tsx)
- [`./route.tsx`](./route.tsx)
- [`./[blocked_email_id]/route.tsx`](./[blocked_email_id]/route.tsx)

## Data Shape

Blocked email object:

```json
{
  "id": "uuid",
  "email": "normalized@example.com",
  "public_reason": "string | null",
  "private_details": "string | null",
  "created_at_millis": 1741339200000,
  "updated_at_millis": 1741339200000,
  "created_by_user_id": "uuid | null"
}
```

## API Usage

### 1) Create or update a blocked email

`POST /api/v1/blocked-emails`

Request body:

```json
{
  "email": "Blocked.User@example.com",
  "public_reason": "Blocked for abuse",
  "private_details": "Raised by support"
}
```

Behavior:

- Email is normalized before storage/comparison.
- Create is an upsert by `(tenancyId, normalizedEmail)`.
- Re-posting the same normalized email updates `public_reason` and `private_details` instead of creating duplicates.

Response:

- `201` with the blocked email object.

### 2) List blocked emails

`GET /api/v1/blocked-emails`

Optional query parameters:

- `email` (must be a valid email; normalized before filtering)

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "email": "blocked.user@example.com",
      "public_reason": "Blocked for abuse",
      "private_details": "Raised by support",
      "created_at_millis": 1741339200000,
      "updated_at_millis": 1741339200000,
      "created_by_user_id": null
    }
  ],
  "is_paginated": false
}
```

### 3) Unblock an email

`DELETE /api/v1/blocked-emails/{blocked_email_id}`

Response:

- `200` on success.

## SDK Usage (`StackAdminApp`)

Available methods:

- `listBlockedEmails(options?: { email?: string })`
- `blockEmail(options: { email: string, publicReason?: string | null, privateDetails?: string | null })`
- `unblockEmail(id: string)`

Example:

```ts
const blocked = await stackAdminApp.blockEmail({
  email: "Blocked.User@example.com",
  publicReason: "Blocked for abuse",
  privateDetails: "Raised by support",
});

const list = await stackAdminApp.listBlockedEmails({
  email: "blocked.user@example.com",
});

await stackAdminApp.unblockEmail(blocked.id);
```

Source files:

- [`packages/stack-shared/src/interface/admin-interface.ts`](../../../../../../../packages/stack-shared/src/interface/admin-interface.ts)
- [`packages/template/src/lib/stack-app/apps/interfaces/admin-app.ts`](../../../../../../../packages/template/src/lib/stack-app/apps/interfaces/admin-app.ts)
- [`packages/template/src/lib/stack-app/apps/implementations/admin-app-impl.ts`](../../../../../../../packages/template/src/lib/stack-app/apps/implementations/admin-app-impl.ts)

## Signup Rejection Behavior

If a signup/upgrade email is blocked, signup is rejected with:

- HTTP `403`
- error code: `BLOCKED_EMAIL_SIGN_UP_NOT_ALLOWED`
- error message: blocked entry `public_reason` if provided, otherwise default message

Known error type:

- [`KnownErrors.BlockedEmailSignUpNotAllowed`](../../../../../../../packages/stack-shared/src/known-errors.tsx)

Covered flows:

- Password signup
- OTP signup/sign-in when creating a new user
- OAuth signup
- Anonymous account upgrade to credential signup

## Existing User Restriction Behavior

When blocking an email that already belongs to a user:

- User is set to `restricted_by_admin: true`.
- `restricted_by_admin_reason` is set to the block `public_reason` only when the user was not already admin-restricted.
- A hidden marker is appended to `restricted_by_admin_private_details` so unblocking can remove only this feature’s restriction.

When unblocking:

- The marker is removed.
- If no other marker/details remain and the admin reason matches this block reason, the admin restriction is cleared.
- Unrelated restrictions (for example manual admin restriction or onboarding restrictions) are preserved.

## Normalization Notes

Blocked emails and signup emails use the same normalization path (`normalizeEmail`), so case differences like:

- `Example.Blocked@Example.com`
- `example.blocked@example.com`

match the same block entry.

## Tests

Behavior and edge cases are covered in:

- [`apps/e2e/tests/backend/endpoints/api/v1/blocked-emails.test.ts`](../../../../../../e2e/tests/backend/endpoints/api/v1/blocked-emails.test.ts)

