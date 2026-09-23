import { clearMockSmsOutboxMessages, getMockSmsOutboxMessages } from "@/lib/sms";
import { createSmartRouteHandler } from "@/route-handlers/smart-route-handler";
import { adaptSchema, adminAuthTypeSchema, phoneNumberSchema, yupArray, yupNumber, yupObject, yupString } from "@stackframe/stack-shared/dist/schema-fields";

const smsOutboxResponseSchema = yupObject({
  statusCode: yupNumber().oneOf([200]).defined(),
  bodyType: yupString().oneOf(["json"]).defined(),
  body: yupObject({
    items: yupArray(yupObject({
      phone_number: phoneNumberSchema.defined(),
      body: yupString().defined(),
      otp: yupString().length(6).defined(),
      sent_at_millis: yupNumber().defined(),
    }).defined()).defined(),
  }).defined(),
}).defined();

export const GET = createSmartRouteHandler({
  metadata: {
    summary: "List mock SMS outbox",
    description: "Lists SMS messages sent by the mock SMS provider. Intended for development and tests.",
    tags: ["Internal"],
  },
  request: yupObject({
    auth: yupObject({
      type: adminAuthTypeSchema,
      tenancy: adaptSchema,
    }).defined(),
  }),
  response: smsOutboxResponseSchema,
  async handler() {
    return {
      statusCode: 200,
      bodyType: "json",
      body: {
        items: getMockSmsOutboxMessages(),
      },
    };
  },
});

export const DELETE = createSmartRouteHandler({
  metadata: {
    summary: "Clear mock SMS outbox",
    description: "Clears SMS messages sent by the mock SMS provider. Intended for development and tests.",
    tags: ["Internal"],
  },
  request: yupObject({
    auth: yupObject({
      type: adminAuthTypeSchema,
      tenancy: adaptSchema,
    }).defined(),
  }),
  response: smsOutboxResponseSchema,
  async handler() {
    clearMockSmsOutboxMessages();
    return {
      statusCode: 200,
      bodyType: "json",
      body: {
        items: [],
      },
    };
  },
});
