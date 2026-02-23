# Mobile OTP Authentication Implementation Plan

## Overview

This document outlines the implementation plan for adding mobile phone-based OTP (One-Time Password) authentication to Stack Auth. The implementation will extend the existing email-based OTP system to support SMS-based authentication.

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)

2. [Proposed Architecture](#2-proposed-architecture)

3. [Database Changes](#3-database-changes)

4. [Backend API Changes](#4-backend-api-changes)

5. [SMS Provider Integration](#5-sms-provider-integration)

6. [Frontend Changes](#6-frontend-changes)

7. [Dashboard Changes](#7-dashboard-changes)

8. [Configuration Schema Changes](#8-configuration-schema-changes)

9. [File Changes Summary](#9-file-changes-summary)

10. [Implementation Phases](#10-implementation-phases)

11. [Testing Strategy](#11-testing-strategy)

12. [Security Considerations](#12-security-considerations)

---

## 1. Current Architecture Analysis

### Existing OTP Infrastructure

Stack Auth already has email-based OTP authentication. Key components:

#### Database Schema (`apps/backend/prisma/schema.prisma`)

```prisma

// Contact channel types - PHONE is commented out

enum ContactChannelType {

  EMAIL

  // PHONE  <-- Needs to be uncommented

}

// OTP auth method exists

model OtpAuthMethod {

  tenancyId     String @db.Uuid

  authMethodId  String @db.Uuid

  projectUserId String @db.Uuid

  // ... relationships

}

// Verification codes are used for OTP

model VerificationCode {

  projectId String

  branchId  String

  id        String @default(uuid()) @db.Uuid

  type      VerificationCodeType  // Includes ONE_TIME_PASSWORD

  code      String

  expiresAt DateTime

  // ...

}

```

#### Backend API Endpoints

| Endpoint | File | Purpose |

|----------|------|---------|

| `POST /api/latest/auth/otp/send-sign-in-code` | `apps/backend/src/app/api/latest/auth/otp/send-sign-in-code/route.tsx` | Send OTP code via email |

| `POST /api/latest/auth/otp/sign-in` | `apps/backend/src/app/api/latest/auth/otp/sign-in/route.tsx` | Verify OTP and sign in |

| `POST /api/latest/auth/otp/sign-in/check-code` | `apps/backend/src/app/api/latest/auth/otp/sign-in/check-code/route.tsx` | Check if code is valid |

#### Configuration Schema (`packages/stack-shared/src/config/schema.ts`)

```typescript

const branchAuthSchema = yupObject({

// ...

otp: yupObject({

    allowSignIn: yupBoolean(),  // Default: false

}),

// ...

});

```

#### Frontend Components

| Component | File | Purpose |

|-----------|------|---------|

| `MagicLinkSignIn` | `packages/stack/src/components/magic-link-sign-in.tsx` | Email input + OTP verification |

| `OtpSection` | `packages/stack/src/components-page/account-settings/email-and-auth/otp-section.tsx` | Account settings OTP toggle |

---

## 2. Proposed Architecture

### Design Principles

1. **Extend, don't replace**: Build on existing OTP infrastructure

2. **Generic SMS interface**: Support any SMS provider via HTTP API

3. **Multi-channel support**: Users can have both email and phone OTP enabled

4. **E.164 format**: International phone number standard (+1234567890)

### High-Level Architecture

```

┌─────────────────────────────────────────────────────────────────┐

│                        Client (React/Next.js)                    │

├─────────────────────────────────────────────────────────────────┤

│  PhoneOtpSignIn Component  │  MagicLinkSignIn (existing)        │

│  Phone Input + OTP Input   │  Email Input + OTP Input           │

└─────────────────────────────────────────────────────────────────┘

                                    │

                                    ▼

┌─────────────────────────────────────────────────────────────────┐

│                        Backend API                               │

├─────────────────────────────────────────────────────────────────┤

│  POST /auth/otp/phone/send-code    │  POST /auth/otp/send-code  │

│  POST /auth/otp/phone/sign-in      │  POST /auth/otp/sign-in    │

└─────────────────────────────────────────────────────────────────┘

                                    │

                    ┌───────────────┴───────────────┐

                    ▼                               ▼

┌─────────────────────────────┐    ┌─────────────────────────────┐

│      SMS Service Layer       │    │     Email Service Layer      │

│  (Generic HTTP API Client)   │    │  (Existing Resend/SMTP)      │

└─────────────────────────────┘    └─────────────────────────────┘

                    │

                    ▼

┌─────────────────────────────────────────────────────────────────┐

│                    SMS Provider (Configurable)                   │

├─────────────────────────────────────────────────────────────────┤

│  Twilio  │  AWS SNS  │  Airtel DLT  │  Custom HTTP Gateway      │

└─────────────────────────────────────────────────────────────────┘

```

---

## 3. Database Changes

### File: `apps/backend/prisma/schema.prisma`

#### 3.1 Enable PHONE Contact Channel Type

```prisma

// CHANGE: Uncomment PHONE

enum ContactChannelType {

  EMAIL

  PHONE  // <-- Uncomment this line

}

```

#### 3.2 Add Phone-specific Fields to ContactChannel (Optional)

The existing `ContactChannel` model can be used as-is for phone numbers. The `value` field will store the phone number in E.164 format.

```prisma

model ContactChannel {

  // Existing fields work for phone:

  type        ContactChannelType  // EMAIL or PHONE

  value       String              // Phone number in E.164 format (e.g., +1234567890)

  isVerified  Boolean             // Whether phone is verified via OTP

  usedForAuth BooleanTrue?        // Whether phone can be used for auth

  // ...

}

```

#### 3.3 Migration File

Create migration: `prisma/migrations/YYYYMMDD_add_phone_contact_channel/migration.sql`

```sql

-- Enable PHONE contact channel type

-- Note: Prisma enums are automatically extended when you update the schema

-- This migration primarily documents the change

-- Add index for phone lookups

CREATE INDEX IF NOT EXISTS "ContactChannel_type_value_idx"

ON "ContactChannel" ("type", "value");

```

---

## 4. Backend API Changes

### 4.1 New Files to Create

#### `apps/backend/src/app/api/latest/auth/otp/phone/send-sign-in-code/route.tsx`

```typescript

// Send OTP via SMS to phone number

import { createSmartRouteHandler } from "@/route-handlers/smart-route-handler";

import { phoneE164Schema, yupObject, yupString, yupNumber } from "@stackframe/stack-shared/dist/schema-fields";

import { sendSmsOtp } from "@/lib/sms";

export const POST = createSmartRouteHandler({

metadata: {

    summary: "Send phone sign-in code",

    description: "Send a 6-digit OTP code to the user's phone number for sign-in.",

    tags: ["OTP", "Phone"],

},

request: yupObject({

    auth: yupObject({

      type: clientOrHigherAuthTypeSchema,

      tenancy: adaptSchema,

}).defined(),

    body: yupObject({

      phone_number: phoneE164Schema.defined(),  // E.164 format

      callback_url: callbackUrlSchema.defined(),

}).defined(),

}),

response: yupObject({

    statusCode: yupNumber().oneOf([200]).defined(),

    bodyType: yupString().oneOf(["json"]).defined(),

    body: yupObject({

      nonce: yupString().defined(),

}).defined(),

}),

async handler({ auth: { tenancy }, body: { phone_number, callback_url } }) {

// Check if phone OTP is enabled for this project

if (!tenancy.config.auth.phoneOtp?.allowSignIn) {

throw new StatusError(StatusError.Forbidden, "Phone OTP sign-in is not enabled");

}

// Validate phone number format

// Check rate limits

// Send OTP via SMS

// Return nonce for verification

},

});

```

#### `apps/backend/src/app/api/latest/auth/otp/phone/sign-in/route.tsx`

```typescript

// Verify phone OTP and sign in

export const POST = phoneSignInVerificationCodeHandler.postHandler;

```

#### `apps/backend/src/app/api/latest/auth/otp/phone/sign-in/verification-code-handler.tsx`

```typescript

// Similar to email verification-code-handler but for phone

import { createVerificationCodeHandler } from "@/route-handlers/verification-code-handler";

import { sendSms } from "@/lib/sms";

export const phoneSignInVerificationCodeHandler = createVerificationCodeHandler({

type: VerificationCodeType.ONE_TIME_PASSWORD,

method: yupObject({

    phone: phoneE164Schema.defined(),

}),

async send(codeObj, createOptions, sendOptions) {

await sendSms({

to: createOptions.method.phone,

message: `Your verification code is: ${codeObj.code.slice(0, 6).toUpperCase()}`,

tenancy: createOptions.tenancy,

});

return { nonce: codeObj.code.slice(6) };

},

async handler(tenancy, { phone }, data, requestBody, currentUser) {

// Similar to email handler:

// 1. Find or create user by phone

// 2. Create auth tokens

// 3. Return sign-in response

},

});

```

### 4.2 SMS Service Layer

#### `apps/backend/src/lib/sms.tsx`

```typescript

import { Tenancy } from "./tenancies";

export interface SmsConfig {

provider: 'http' | 'twilio' | 'aws-sns';

// HTTP provider config

httpEndpoint?: string;

httpMethod?: 'GET' | 'POST';

httpHeaders?: Record<string, string>;

httpBodyTemplate?: string;  // Template with {{to}}, {{message}} placeholders

// Twilio config

twilioAccountSid?: string;

twilioAuthToken?: string;

twilioFromNumber?: string;

// AWS SNS config

awsRegion?: string;

awsAccessKeyId?: string;

awsSecretAccessKey?: string;

}

export async function sendSms(options: {

  to: string;  // E.164 format

  message: string;

  tenancy: Tenancy;

}): Promise<void> {

const smsConfig = options.tenancy.config.sms;

if (!smsConfig || smsConfig.provider === 'none') {

throw new Error("SMS is not configured for this project");

  }

switch (smsConfig.provider) {

case 'http':

return sendSmsViaHttp(options, smsConfig);

case 'twilio':

return sendSmsViaTwilio(options, smsConfig);

case 'aws-sns':

return sendSmsViaAwsSns(options, smsConfig);

default:

throw new Error(`Unknown SMS provider: ${smsConfig.provider}`);

  }

}

async function sendSmsViaHttp(

options: { to: string; message: string },

config: SmsConfig

): Promise<void> {

const body = config.httpBodyTemplate

    ?.replace('{{to}}', options.to)

    ?.replace('{{message}}', options.message);

const response = await fetch(config.httpEndpoint!, {

method: config.httpMethod || 'POST',

headers: {

'Content-Type': 'application/json',

...config.httpHeaders,

},

body,

});

if (!response.ok) {

throw new Error(`SMS send failed: ${response.statusText}`);

  }

}

```

### 4.3 Phone Number Validation

#### `packages/stack-shared/src/schema-fields.ts`

Add phone number validation schema:

```typescript

// E.164 phone number format: +[country code][number]

// Examples: +14155551234, +919876543210

export const phoneE164Schema = yupString()

  .matches(

/^\+[1-9]\d{6,14}$/,

'Phone number must be in E.164 format (e.g., +14155551234)'

  )

  .meta({

openapiField: {

      description: 'Phone number in E.164 international format',

      exampleValue: '+14155551234',

},

  });

// Phone number for sign-in (with normalization)

export const signInPhoneSchema = phoneE164Schema

  .transform((value) => {

// Remove spaces, dashes, parentheses

if (typeof value === 'string') {

return value.replace(/[\s\-\(\)]/g, '');

    }

return value;

  });

```

---

## 5. SMS Provider Integration

### 5.1 Generic HTTP API (Recommended for Airtel DLT)

For Airtel DLT and other providers, use a generic HTTP API approach:

```typescript

// Configuration for Airtel DLT via HTTP

const airtelDltConfig = {

provider: 'http',

httpEndpoint: 'https://api.airtel.in/sms/send',  // Example URL

httpMethod: 'POST',

httpHeaders: {

'Authorization': 'Bearer {{API_KEY}}',

'Content-Type': 'application/json',

},

httpBodyTemplate: JSON.stringify({

    to: '{{to}}',

    message: '{{message}}',

    entityId: '{{ENTITY_ID}}',      // DLT Entity ID

    templateId: '{{TEMPLATE_ID}}',   // DLT Template ID

    senderId: '{{SENDER_ID}}',       // Registered sender

}),

};

```

### 5.2 Airtel DLT Specific Requirements

For India's Airtel DLT compliance:

1. **Entity Registration**: Register on Airtel's DLT platform

2. **Template Registration**: Pre-register OTP message templates

3. **Sender ID**: Get approved sender ID (e.g., "STAUTH")

4. **Headers**: Include required DLT headers

Example approved template format:

```

Your Stack Auth verification code is {#var#}. Do not share this code.

```

### 5.3 Provider Abstraction

Create provider-specific implementations in `apps/backend/src/lib/sms/providers/`:

```

apps/backend/src/lib/sms/

├── index.tsx           # Main SMS service

├── providers/

│   ├── http.tsx        # Generic HTTP provider

│   ├── twilio.tsx      # Twilio provider

│   └── aws-sns.tsx     # AWS SNS provider

└── types.tsx           # Shared types

```

---

## 6. Frontend Changes

### 6.1 New Components

#### `packages/stack/src/components/phone-otp-sign-in.tsx`

```tsx

'use client';

import { useState } from "react";

import { useStackApp } from "..";

import { useTranslation } from "../lib/translations";

import { Button, Input, InputOTP, InputOTPGroup, InputOTPSlot, Label, Typography } from "@stackframe/stack-ui";

function PhoneOTP({ onBack, nonce }: { onBack: () => void; nonce: string }) {

const { t } = useTranslation();

const [otp, setOtp] = useState('');

const [submitting, setSubmitting] = useState(false);

const [error, setError] = useState<string | null>(null);

const stackApp = useStackApp();

useEffect(() => {

if (otp.length === 6 && !submitting) {

setSubmitting(true);

stackApp.signInWithPhoneOtp(otp + nonce)

        .then(result => {

if (result.status === 'error') {

setError(t("Invalid code"));

          }

        })

        .finally(() => {

setSubmitting(false);

setOtp('');

        });

    }

  }, [otp, submitting]);

return (

    <div className="flex flex-col items-stretch stack-scope">

      <Typography className='mb-2'>{t('Enter the code sent to your phone')}</Typography>

      <InputOTP

maxLength={6}

value={otp}

onChange={value => setOtp(value.toUpperCase())}

disabled={submitting}

>

        <InputOTPGroup>

          {[0, 1, 2, 3, 4, 5].map((index) => (

            <InputOTPSlot key={index} index={index} size='lg' />

          ))}

        </InputOTPGroup>

      </InputOTP>

      {error && <FormWarningText text={error} />}

      <Button variant='link' onClick={onBack}>{t('Cancel')}</Button>

    </div>

  );

}

export function PhoneOtpSignIn() {

const { t } = useTranslation();

const app = useStackApp();

const [loading, setLoading] = useState(false);

const [nonce, setNonce] = useState<string | null>(null);

const [phone, setPhone] = useState('');

const [error, setError] = useState<string | null>(null);

const handleSubmit = async (e: React.FormEvent) => {

e.preventDefault();

setLoading(true);

try {

const result = await app.sendPhoneOtp(phone);

if (result.status === 'error') {

setError(result.error.message);

} else {

setNonce(result.data.nonce);

}

} finally {

setLoading(false);

}

};

if (nonce) {

return <PhoneOTP nonce={nonce} onBack={() => setNonce(null)} />;

  }

return (

    <form onSubmit={handleSubmit} className="flex flex-col items-stretch stack-scope">

      <Label htmlFor="phone" className="mb-1">{t('Phone Number')}</Label>

      <Input

id="phone"

type="tel"

placeholder="+1234567890"

value={phone}

onChange={(e) => setPhone(e.target.value)}

/>

      {error && <FormWarningText text={error} />}

      <Button type="submit" className="mt-6" loading={loading}>

        {t('Send code')}

      </Button>

    </form>

  );

}

```

### 6.2 Update Sign-In Page

#### `packages/stack/src/components-page/sign-in.tsx`

Add phone OTP option alongside email:

```tsx

// Add to sign-in page

{project.config.phoneOtpEnabled && (

  <Tab value="phone">

    <PhoneOtpSignIn />

  </Tab>

)}

```

### 6.3 SDK Methods

#### `packages/stack/src/lib/stack-app.tsx`

Add phone OTP methods to the StackApp:

```typescript

// Add to StackApp class

async sendPhoneOtp(phoneNumber: string): Promise<Result<{ nonce: string }>> {

  const response = await this._interface.sendPhoneOtpCode({

    phone_number: phoneNumber,

    callback_url: window.location.href,

});

  return response;

}

async signInWithPhoneOtp(code: string): Promise<Result<SignInResponse>> {

  const response = await this._interface.signInWithPhoneOtp({ code });

  return response;

}

```

---

## 7. Dashboard Changes

### 7.1 Auth Methods Configuration

#### `apps/dashboard/src/app/(main)/(protected)/projects/[projectId]/auth-methods/page-client.tsx`

Add phone OTP toggle:

```tsx

// Add to auth methods configuration

<Section title="Phone OTP">

  <Switch

checked={config.auth.phoneOtp.allowSignIn}

onCheckedChange={(checked) => updateConfig({

      auth: { phoneOtp: { allowSignIn: checked } }

})}

/>

  <Typography variant="secondary">

    Allow users to sign in with a one-time password sent to their phone

  </Typography>

</Section>

```

### 7.2 SMS Provider Configuration

Create new page: `apps/dashboard/src/app/(main)/(protected)/projects/[projectId]/sms-settings/page.tsx`

```tsx

// SMS Provider configuration page

export default function SmsSettingsPage() {

return (

    <PageLayout title="SMS Settings">

      <Section title="SMS Provider">

        <Select

value={config.sms.provider}

onValueChange={(value) => updateConfig({ sms: { provider: value } })}

>

          <SelectItem value="none">Disabled</SelectItem>

          <SelectItem value="http">HTTP API (Custom)</SelectItem>

          <SelectItem value="twilio">Twilio</SelectItem>

          <SelectItem value="aws-sns">AWS SNS</SelectItem>

        </Select>

      </Section>

      {config.sms.provider === 'http' && (

        <HttpProviderConfig config={config.sms} onChange={updateSmsConfig} />

      )}

      {/* Provider-specific config forms */}

    </PageLayout>

  );

}

```

---

## 8. Configuration Schema Changes

### `packages/stack-shared/src/config/schema.ts`

Add SMS and phone OTP configuration:

```typescript

const branchAuthSchema = yupObject({

// ... existing fields

otp: yupObject({

    allowSignIn: yupBoolean(),  // Email OTP

}),

phoneOtp: yupObject({         // NEW: Phone OTP

    allowSignIn: yupBoolean(),

}),

// ...

});

// Add SMS configuration to environment config

const environmentConfigSchema = branchConfigSchema.concat(yupObject({

// ... existing fields

sms: yupObject({

    provider: yupString().oneOf(['none', 'http', 'twilio', 'aws-sns']),

// HTTP provider config

    http: yupObject({

      endpoint: yupString().url(),

      method: yupString().oneOf(['GET', 'POST']),

      headers: yupRecord(yupString(), yupString()),

      bodyTemplate: yupString(),

}).optional(),

// Twilio config

    twilio: yupObject({

      accountSid: yupString(),

      authToken: yupString(),

      fromNumber: phoneE164Schema,

}).optional(),

// AWS SNS config

    awsSns: yupObject({

      region: yupString(),

      accessKeyId: yupString(),

      secretAccessKey: yupString(),

}).optional(),

}),

}));

```

### Default Values

```typescript

const organizationConfigDefaults = {

// ... existing defaults

auth: {

// ... existing

    phoneOtp: {

      allowSignIn: false,  // Disabled by default

},

},

sms: {

    provider: 'none',

    http: {

      endpoint: undefined,

      method: 'POST',

      headers: {},

      bodyTemplate: undefined,

},

    twilio: {

      accountSid: undefined,

      authToken: undefined,

      fromNumber: undefined,

},

    awsSns: {

      region: undefined,

      accessKeyId: undefined,

      secretAccessKey: undefined,

},

},

};

```

---

## 9. File Changes Summary

### New Files to Create

| File | Purpose |

|------|---------|

| `apps/backend/src/lib/sms/index.tsx` | Main SMS service |

| `apps/backend/src/lib/sms/providers/http.tsx` | Generic HTTP SMS provider |

| `apps/backend/src/lib/sms/providers/twilio.tsx` | Twilio provider |

| `apps/backend/src/lib/sms/providers/aws-sns.tsx` | AWS SNS provider |

| `apps/backend/src/lib/sms/types.tsx` | SMS types |

| `apps/backend/src/app/api/latest/auth/otp/phone/send-sign-in-code/route.tsx` | Send phone OTP endpoint |

| `apps/backend/src/app/api/latest/auth/otp/phone/sign-in/route.tsx` | Phone sign-in endpoint |

| `apps/backend/src/app/api/latest/auth/otp/phone/sign-in/verification-code-handler.tsx` | Phone verification handler |

| `apps/backend/src/app/api/latest/auth/otp/phone/sign-in/check-code/route.tsx` | Check phone code endpoint |

| `packages/stack/src/components/phone-otp-sign-in.tsx` | Phone OTP sign-in component |

| `packages/template/src/components/phone-otp-sign-in.tsx` | Template version |

| `apps/dashboard/src/app/(main)/(protected)/projects/[projectId]/sms-settings/page.tsx` | SMS settings page |

| `apps/backend/prisma/migrations/YYYYMMDD_add_phone_otp/migration.sql` | Database migration |

### Files to Modify

| File | Changes |

|------|---------|

| `apps/backend/prisma/schema.prisma` | Uncomment `PHONE` in `ContactChannelType` |

| `packages/stack-shared/src/schema-fields.ts` | Add `phoneE164Schema`, `signInPhoneSchema` |

| `packages/stack-shared/src/config/schema.ts` | Add `phoneOtp` and `sms` config schemas |

| `packages/stack/src/components-page/sign-in.tsx` | Add phone OTP tab |

| `packages/stack/src/lib/stack-app.tsx` | Add `sendPhoneOtp`, `signInWithPhoneOtp` methods |

| `packages/stack-shared/src/interface/client-interface.ts` | Add phone OTP interface methods |

| `apps/dashboard/src/app/(main)/(protected)/projects/[projectId]/auth-methods/page-client.tsx` | Add phone OTP toggle |

| `apps/e2e/tests/backend/endpoints/api/v1/auth/otp/` | Add phone OTP tests |

---

## 10. Implementation Phases

### Phase 1: Database & Schema (1-2 days)

1. Uncomment `PHONE` in `ContactChannelType` enum

2. Add phone validation schemas to `schema-fields.ts`

3. Add `phoneOtp` and `sms` config to schema

4. Create Prisma migration

5. Run migration and update Prisma client

### Phase 2: SMS Service Layer (2-3 days)

1. Create SMS service abstraction (`apps/backend/src/lib/sms/`)

2. Implement HTTP provider (generic)

3. Implement Twilio provider

4. Implement AWS SNS provider

5. Add SMS configuration to tenancy config

### Phase 3: Backend API (2-3 days)

1. Create phone OTP endpoints

2. Create phone verification code handler

3. Add rate limiting for SMS

4. Add phone contact channel management

5. Update user creation flow to support phone

### Phase 4: Frontend Components (2-3 days)

1. Create `PhoneOtpSignIn` component

2. Update sign-in page with phone tab

3. Add SDK methods for phone OTP

4. Create phone input with country code selector

5. Update account settings for phone management

### Phase 5: Dashboard (1-2 days)

1. Add phone OTP toggle in auth methods

2. Create SMS settings page

3. Add provider-specific configuration forms

4. Add SMS testing functionality

### Phase 6: Testing & Documentation (2-3 days)

1. Write unit tests for SMS service

2. Write E2E tests for phone OTP flow

3. Test with actual SMS providers

4. Update API documentation

5. Write user documentation

**Total Estimated Time: 10-16 days**

---

## 11. Testing Strategy

### Unit Tests

- Phone number validation (E.164 format)

- SMS provider selection logic

- HTTP provider request formatting

- OTP code generation and validation

### Integration Tests

```typescript

// apps/e2e/tests/backend/endpoints/api/v1/auth/otp/phone-send-sign-in-code.test.ts

describe("Phone OTP - Send Sign-in Code", () => {

it("should send OTP to valid phone number", async () => {

// Test implementation

  });

it("should reject invalid phone format", async () => {

// Test implementation

  });

it("should respect rate limits", async () => {

// Test implementation

  });

});

```

### E2E Tests

```typescript

// apps/e2e/tests/js/phone-otp.test.ts

describe("Phone OTP Sign-in Flow", () => {

it("should complete full sign-in flow with phone OTP", async () => {

// 1. Enter phone number

// 2. Receive OTP (mock SMS)

// 3. Enter OTP

// 4. Verify sign-in success

  });

});

```

### Mock SMS Provider

Create a mock SMS provider for testing:

```typescript

// apps/backend/src/lib/sms/providers/mock.tsx

export class MockSmsProvider {

private sentMessages: Array<{ to: string; message: string }> = [];

async send(to: string, message: string) {

this.sentMessages.push({ to, message });

console.log(`[MOCK SMS] To: ${to}, Message: ${message}`);

}

getLastCode(phoneNumber: string): string | undefined {

const message = this.sentMessages

.filter(m => m.to === phoneNumber)

.pop();

return message?.message.match(/\d{6}/)?.[0];

}

}

```

---

## 12. Security Considerations

### Rate Limiting

Implement strict rate limits for SMS:

```typescript

const SMS_RATE_LIMITS = {

perPhoneNumber: {

    maxRequests: 5,

    windowMs: 60 * 60 * 1000,  // 1 hour

},

perIp: {

    maxRequests: 10,

    windowMs: 60 * 60 * 1000,  // 1 hour

},

global: {

    maxRequests: 1000,

    windowMs: 60 * 60 * 1000,  // 1 hour

},

};

```

### OTP Security

- 6-digit numeric code

- 10-minute expiration

- Max 5 verification attempts

- Code invalidated after successful use

- Nonce required for verification

### Phone Number Validation

- Validate E.164 format

- Consider phone number verification service (optional)

- Block disposable/VoIP numbers (optional)

### SMS Content

- Don't include sensitive data in SMS

- Use approved DLT templates (India)

- Clear expiration notice

### Audit Logging

Log all SMS operations:

- Phone number (partially masked)

- Timestamp

- IP address

- Success/failure

- Provider used

---

## Appendix A: Airtel DLT Registration Guide

### Steps to Register

1. **Visit Airtel DLT Portal**: https://www.airtel.in/business/commercial-communications/

2. **Register as Entity**: Provide business documentation

3. **Register Headers (Sender IDs)**: e.g., "STAUTH"

4. **Register Templates**: Submit OTP message templates

5. **Get API Credentials**: Obtain API key and endpoint

### Template Examples

```

Template 1 (OTP):

Your Stack Auth verification code is {#var#}. Valid for 10 minutes. Do not share.

Template 2 (Welcome):

Welcome to Stack Auth! Your account has been created successfully.

```

### API Integration

```typescript

// Example Airtel DLT HTTP configuration

{

  provider: 'http',

  http: {

    endpoint: 'https://iqsms.airtel.in/api/v3/sendsms',

    method: 'POST',

    headers: {

'Content-Type': 'application/json',

'Authorization': 'Bearer YOUR_API_KEY',

    },

    bodyTemplate: JSON.stringify({

sender: 'STAUTH',

recipient: '{{to}}',

message: '{{message}}',

entityId: 'YOUR_ENTITY_ID',

templateId: 'YOUR_TEMPLATE_ID',

    }),

  },

}

```

---

## Appendix B: Alternative SMS Providers

### Twilio

```typescript

{

  provider: 'twilio',

  twilio: {

    accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',

    authToken: 'your_auth_token',

    fromNumber: '+15017122661',

  },

}

```

### AWS SNS

```typescript

{

  provider: 'aws-sns',

  awsSns: {

    region: 'ap-south-1',

    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',

    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',

  },

}

```

### MSG91 (India)

```typescript

{

  provider: 'http',

  http: {

    endpoint: 'https://api.msg91.com/api/v5/otp',

    method: 'POST',

    headers: {

'authkey': 'YOUR_AUTH_KEY',

'Content-Type': 'application/json',

    },

    bodyTemplate: JSON.stringify({

mobile: '{{to}}',

otp: '{{code}}',

sender: 'STAUTH',

DLT_TE_ID: 'YOUR_TEMPLATE_ID',

    }),

  },

}

```

---

*Document created: February 7, 2026*

*Last updated: February 7, 2026
