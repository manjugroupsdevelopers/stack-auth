# Aivida Auth API Integration Guide

This document explains how to use the existing Stack Auth APIs for email/password auth and phone OTP auth.

## Environments

Use dev for testing:

```text
Dev Dashboard: https://auth-dev-stack.aivida.in
Dev API:       https://auth-api-dev-stack.aivida.in
```

Production uses the same paths on the live API:

```text
Prod Dashboard: https://auth-live.aivida.in
Prod API:       https://auth-api-live.aivida.in
```

Do not use production for testing new flows unless explicitly approved.

## Required Client Headers

Every client-side auth request must include these headers:

```http
Content-Type: application/json
X-Stack-Access-Type: client
X-Stack-Project-Id: <project_id>
X-Stack-Publishable-Client-Key: <publishable_client_key>
```

Never send server secret keys or admin keys from a mobile app, browser app, or shared Postman collection.

## Dev Project

Use the dev project configured for the dev deployment:

```text
Project ID: 24e8c588-0968-46df-a82f-ab4d554cfc73
API URL:    https://auth-api-dev-stack.aivida.in
```

Dev currently uses mock SMS. Phone OTP API calls work end to end, but no real SMS will arrive from dev.

## Auth Options

The app can use:

```text
Email/password signup and signin
Phone OTP signup and signin
```

For phone OTP, there is no separate signup endpoint. The same OTP signin endpoint handles both signup and login:

```text
New phone number + signup enabled = creates user after OTP verification
Existing phone number             = signs in existing user after OTP verification
```

## Phone Format

Phone numbers must be E.164 formatted:

```text
+<country_code><number>
```

Example:

```text
+916369487527
```

Do not send spaces, hyphens, local-only numbers, or leading-zero formats.

## Email/Password Signup

```http
POST /api/v1/auth/password/sign-up
```

```bash
curl -X POST "https://auth-api-dev-stack.aivida.in/api/v1/auth/password/sign-up" \
  -H "Content-Type: application/json" \
  -H "X-Stack-Access-Type: client" \
  -H "X-Stack-Project-Id: 24e8c588-0968-46df-a82f-ab4d554cfc73" \
  -H "X-Stack-Publishable-Client-Key: <publishable_client_key>" \
  --data '{
    "email": "user@example.com",
    "password": "12345678",
    "verification_callback_url": "https://your-app.example.com/email-verified"
  }'
```

Success response:

```json
{
  "access_token": "<jwt_access_token>",
  "refresh_token": "<refresh_token>",
  "is_new_user": true,
  "user_id": "<user_id>"
}
```

`verification_callback_url` is optional.

## Email/Password Signin

```http
POST /api/v1/auth/password/sign-in
```

```bash
curl -X POST "https://auth-api-dev-stack.aivida.in/api/v1/auth/password/sign-in" \
  -H "Content-Type: application/json" \
  -H "X-Stack-Access-Type: client" \
  -H "X-Stack-Project-Id: 24e8c588-0968-46df-a82f-ab4d554cfc73" \
  -H "X-Stack-Publishable-Client-Key: <publishable_client_key>" \
  --data '{
    "email": "user@example.com",
    "password": "12345678"
  }'
```

Success response:

```json
{
  "access_token": "<jwt_access_token>",
  "refresh_token": "<refresh_token>",
  "is_new_user": false,
  "user_id": "<user_id>"
}
```

## Phone OTP Step 1: Send Code

Sends a 6-digit OTP to the phone number and returns a nonce.

```http
POST /api/v1/auth/phone-otp/send-code
```

```bash
curl -X POST "https://auth-api-dev-stack.aivida.in/api/v1/auth/phone-otp/send-code" \
  -H "Content-Type: application/json" \
  -H "X-Stack-Access-Type: client" \
  -H "X-Stack-Project-Id: 24e8c588-0968-46df-a82f-ab4d554cfc73" \
  -H "X-Stack-Publishable-Client-Key: <publishable_client_key>" \
  --data '{
    "phone": "+916369487527"
  }'
```

Success response:

```json
{
  "nonce": "<nonce>"
}
```

Store the nonce temporarily until the user enters the OTP.

## Phone OTP Step 2: Build Verification Code

The user receives a 6-digit OTP by SMS. Concatenate:

```text
final_code = otp + nonce
```

Example:

```text
OTP:        123456
Nonce:      kxg30jajtd07zzps46b13s8p0k7317t34n2f110
Final code: 123456kxg30jajtd07zzps46b13s8p0k7317t34n2f110
```

The app must send the final concatenated code to check or sign in.

## Phone OTP Optional: Check Code

Checks whether the OTP code is valid without consuming it.

```http
POST /api/v1/auth/phone-otp/sign-in/check-code
```

```bash
curl -X POST "https://auth-api-dev-stack.aivida.in/api/v1/auth/phone-otp/sign-in/check-code" \
  -H "Content-Type: application/json" \
  -H "X-Stack-Access-Type: client" \
  -H "X-Stack-Project-Id: 24e8c588-0968-46df-a82f-ab4d554cfc73" \
  -H "X-Stack-Publishable-Client-Key: <publishable_client_key>" \
  --data '{
    "code": "123456kxg30jajtd07zzps46b13s8p0k7317t34n2f110"
  }'
```

Success response:

```json
{
  "is_code_valid": true
}
```

## Phone OTP Step 3: Signup Or Signin

Verifies the OTP and returns auth tokens. This creates a user for a new phone number and signs in an existing user for an existing phone number.

```http
POST /api/v1/auth/phone-otp/sign-in
```

```bash
curl -X POST "https://auth-api-dev-stack.aivida.in/api/v1/auth/phone-otp/sign-in" \
  -H "Content-Type: application/json" \
  -H "X-Stack-Access-Type: client" \
  -H "X-Stack-Project-Id: 24e8c588-0968-46df-a82f-ab4d554cfc73" \
  -H "X-Stack-Publishable-Client-Key: <publishable_client_key>" \
  --data '{
    "code": "123456kxg30jajtd07zzps46b13s8p0k7317t34n2f110"
  }'
```

New phone number response:

```json
{
  "access_token": "<jwt_access_token>",
  "refresh_token": "<refresh_token>",
  "is_new_user": true,
  "user_id": "<user_id>"
}
```

Existing phone number response:

```json
{
  "access_token": "<jwt_access_token>",
  "refresh_token": "<refresh_token>",
  "is_new_user": false,
  "user_id": "<user_id>"
}
```

## Use Token With Existing APIs

After password signin or phone OTP signin, use `X-Stack-Access-Token` with existing user APIs.

Current user:

```bash
curl -X GET "https://auth-api-dev-stack.aivida.in/api/v1/users/me" \
  -H "X-Stack-Access-Type: client" \
  -H "X-Stack-Project-Id: 24e8c588-0968-46df-a82f-ab4d554cfc73" \
  -H "X-Stack-Publishable-Client-Key: <publishable_client_key>" \
  -H "X-Stack-Access-Token: <jwt_access_token>"
```

Current user contact channels:

```bash
curl -X GET "https://auth-api-dev-stack.aivida.in/api/v1/contact-channels?user_id=me" \
  -H "X-Stack-Access-Type: client" \
  -H "X-Stack-Project-Id: 24e8c588-0968-46df-a82f-ab4d554cfc73" \
  -H "X-Stack-Publishable-Client-Key: <publishable_client_key>" \
  -H "X-Stack-Access-Token: <jwt_access_token>"
```

For phone OTP users, the phone contact channel should be verified:

```json
{
  "type": "phone",
  "value": "+916369487527",
  "used_for_auth": true,
  "is_verified": true,
  "is_primary": true
}
```

## Roles And Teams

Access tokens include Stack Auth claims. For team-based roles, use the selected/default team and the user's team permissions.

Current app assumption:

```text
One user belongs to one active team.
If no team is explicitly selected, use the first/default team.
```

If role claims are empty for a user who should have roles, verify:

```text
1. The user is in the expected team.
2. The user has team permissions assigned.
3. The selected/default team is set correctly.
4. A fresh token was generated after membership or permission updates.
```

## Common Errors

OTP login disabled:

```text
403 OTP sign-in is not enabled for this project
```

Fix: enable OTP signin for the project in dashboard auth methods.

Signup disabled:

```json
{
  "code": "SIGN_UP_NOT_ENABLED",
  "error": "Creation of new accounts is not enabled for this project. Please ask the project owner to enable it."
}
```

Fix: enable signup, or create the user server-side before OTP signin.

Invalid or expired OTP:

```json
{
  "code": "VERIFICATION_CODE_NOT_FOUND",
  "error": "The verification code does not exist for this project."
}
```

Fix: ask the user to request a new OTP.

Wrong phone format:

```text
400 request validation error
```

Fix: send E.164 format, for example `+916369487527`.

SMS not received in production:

```text
The auth API accepted the request, but the SMS provider did not deliver the OTP.
```

Check:

```text
1. SMS provider API credentials are configured.
2. The server public IP or domain is whitelisted by the SMS provider if required.
3. The SMS provider supports domestic or international delivery for the target number.
4. Provider logs show successful delivery.
```

## Verified Dev Test

The separate dev deployment was tested against:

```text
API:        https://auth-api-dev-stack.aivida.in
Project ID: 24e8c588-0968-46df-a82f-ab4d554cfc73
Phone:      +916369487527
```

Results:

```text
Health check:              ok
Phone OTP send-code:       200
Phone OTP check-code:      200, is_code_valid=true
Phone OTP new signin:      200, is_new_user=true
Phone OTP existing signin: 200, is_new_user=false
```

## Mobile App Checklist

1. Store API base URL, project ID, and publishable client key in app config.
2. Collect phone number in E.164 format.
3. Call `/auth/phone-otp/send-code`.
4. Store `nonce` temporarily.
5. User enters the 6-digit OTP.
6. Build `code = otp + nonce`.
7. Call `/auth/phone-otp/sign-in`.
8. Store `access_token` and `refresh_token`.
9. Call `/users/me` to load the profile.
10. Route based on `is_new_user`, team, and role data.
