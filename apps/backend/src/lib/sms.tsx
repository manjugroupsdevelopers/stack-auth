import { getEnvVariable, getNodeEnvironment } from "@stackframe/stack-shared/dist/utils/env";
import { StackAssertionError } from "@stackframe/stack-shared/dist/utils/errors";

export type SmsOutboxMessage = {
  phone_number: string,
  body: string,
  otp: string,
  sent_at_millis: number,
};

const mockSmsOutboxMessages: SmsOutboxMessage[] = [];

export function getMockSmsOutboxMessages(): SmsOutboxMessage[] {
  return [...mockSmsOutboxMessages];
}

export function clearMockSmsOutboxMessages(): void {
  mockSmsOutboxMessages.splice(0, mockSmsOutboxMessages.length);
}

export async function sendOtpSms(options: { phoneNumber: string, otp: string }): Promise<void> {
  const provider = getEnvVariable("STACK_SMS_PROVIDER", getNodeEnvironment() === "production" ? "airix" : "mock");
  const messageTemplate = getEnvVariable("STACK_SMS_OTP_MESSAGE_TEMPLATE", "Your verification code is {otp}. It expires in 10 minutes. Do not share it.");
  const message = messageTemplate.replaceAll("{otp}", options.otp);

  if (provider === "mock") {
    const allowMockInProduction = getEnvVariable("STACK_ALLOW_MOCK_SMS_IN_PRODUCTION", "false") === "true";
    if (getNodeEnvironment() === "production" && !allowMockInProduction) {
      throw new StackAssertionError("STACK_SMS_PROVIDER=mock cannot be used in production without STACK_ALLOW_MOCK_SMS_IN_PRODUCTION=true");
    }

    mockSmsOutboxMessages.push({
      phone_number: options.phoneNumber,
      body: message,
      otp: options.otp,
      sent_at_millis: Date.now(),
    });
    return;
  }

  if (provider === "airix") {
    await sendOtpSmsViaAirix(options);
    return;
  }

  if (provider === "airtel") {
    await sendOtpSmsViaAirtel({
      ...options,
      message,
    });
    return;
  }

  if (provider === "airtel-whatsapp") {
    const results = await Promise.allSettled([
      sendOtpSmsViaAirtel({
        ...options,
        message,
      }),
      sendOtpViaWhatsApp(options),
    ]);

    const failures = results.filter((result) => result.status === "rejected");
    for (const failure of failures) {
      console.error("One OTP delivery channel failed while another may have succeeded", failure.reason);
    }

    if (failures.length === results.length) {
      throw new StackAssertionError("Failed to send OTP through Airtel SMS and Airix WhatsApp", { cause: new AggregateError(failures.map((failure) => failure.reason)) });
    }

    return;
  }

  if (provider === "bhash-whatsapp") {
    await Promise.all([
      sendOtpSmsViaBhash({
        ...options,
        message,
      }),
      sendOtpViaWhatsApp(options),
    ]);
    return;
  }

  throw new StackAssertionError(`Unknown STACK_SMS_PROVIDER: ${provider}`);
}

function formatPhoneForCountryCodeProvider(phoneNumber: string): string {
  return phoneNumber.startsWith("+") ? phoneNumber.slice(1) : phoneNumber;
}

function formatIndianPhoneForBhash(phoneNumber: string): string {
  const phoneWithoutPlus = formatPhoneForCountryCodeProvider(phoneNumber);
  return phoneWithoutPlus.startsWith("91") && phoneWithoutPlus.length === 12 ? phoneWithoutPlus.slice(2) : phoneWithoutPlus;
}

async function sendOtpSmsViaAirix(options: { phoneNumber: string, otp: string }): Promise<void> {
  const apiUrl = getEnvVariable("STACK_AIRIX_SMS_API_URL", "https://api-mfpl.theairix.com/api/integrations/otp/send");
  const apiKey = getEnvVariable("STACK_AIRIX_SMS_API_KEY", "");
  const appId = getEnvVariable("STACK_AIRIX_SMS_APP_ID", "");
  const messageType = getEnvVariable("STACK_AIRIX_SMS_MESSAGE_TYPE", "verification");

  if (!apiKey) {
    throw new StackAssertionError("Airix SMS provider is missing required STACK_AIRIX_SMS_API_KEY environment variable");
  }

  const body: {
    phone: string,
    otp: string,
    appId?: string,
    messageType?: string,
  } = {
    phone: formatPhoneForCountryCodeProvider(options.phoneNumber),
    otp: options.otp,
  };

  if (appId) {
    body.appId = appId;
  }

  if (messageType) {
    body.messageType = messageType;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "unknown");
    throw new StackAssertionError(`Failed to send SMS via Airix API: ${response.status} ${responseBody}`);
  }
}

async function sendOtpSmsViaAirtel(options: { phoneNumber: string, otp: string, message: string }): Promise<void> {
  const apiUrl = getEnvVariable("STACK_AIRTEL_SMS_API_URL", getEnvVariable("AIRTEL_SMS_API_URL", "https://iqsms.airtel.in/api/v1/send-prepaid-sms"));
  const customerId = getEnvVariable("STACK_AIRTEL_SMS_CUSTOMER_ID", getEnvVariable("AIRTEL_SMS_CUSTOMER_ID", ""));
  const dltTemplateId = getEnvVariable("STACK_AIRTEL_SMS_DLT_TEMPLATE_ID", getEnvVariable("AIRTEL_SMS_DLT_TEMPLATE_ID", ""));
  const entityId = getEnvVariable("STACK_AIRTEL_SMS_ENTITY_ID", getEnvVariable("AIRTEL_SMS_ENTITY_ID", ""));
  const messageType = getEnvVariable("STACK_AIRTEL_SMS_MESSAGE_TYPE", getEnvVariable("AIRTEL_SMS_MESSAGE_TYPE", "SERVICE_IMPLICIT"));
  const sourceAddress = getEnvVariable("STACK_AIRTEL_SMS_SOURCE_ADDRESS", getEnvVariable("AIRTEL_SMS_SOURCE_ADDRESS", ""));
  const transport = getEnvVariable("STACK_AIRTEL_SMS_TRANSPORT", "fetch");

  if (!customerId || !dltTemplateId || !entityId || !sourceAddress) {
    throw new StackAssertionError("Airtel SMS provider is missing required STACK_AIRTEL_SMS_* environment variables");
  }

  const requestBody = JSON.stringify({
    customerId,
    destinationAddress: [options.phoneNumber],
    dltTemplateId,
    entityId,
    message: options.message,
    messageType,
    sourceAddress,
  });

  const response = transport === "node-https"
    ? await postJsonViaNodeHttps(apiUrl, requestBody)
    : await postJsonViaFetch(apiUrl, requestBody);

  if (response.status < 200 || response.status >= 300) {
    throw new StackAssertionError(`Failed to send SMS via Airtel API: ${response.status} ${response.body}`);
  }

  const parsedResponse: unknown = JSON.parse(response.body);
  if (
    typeof parsedResponse !== "object"
    || parsedResponse === null
    || !("messageRequestId" in parsedResponse)
    || typeof parsedResponse.messageRequestId !== "string"
    || !("incorrectNum" in parsedResponse)
    || !Array.isArray(parsedResponse.incorrectNum)
    || parsedResponse.incorrectNum.length > 0
  ) {
    throw new StackAssertionError(`Failed to send SMS via Airtel API: ${response.status} ${response.body}`);
  }

  console.info("Airtel SMS accepted OTP message", { messageRequestId: parsedResponse.messageRequestId });
}

async function postJsonViaFetch(apiUrl: string, requestBody: string): Promise<{ status: number, body: string }> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
    },
    body: requestBody,
  });

  return {
    status: response.status,
    body: await response.text(),
  };
}

async function postJsonViaNodeHttps(apiUrl: string, requestBody: string): Promise<{ status: number, body: string }> {
  const { request } = await import("node:https");
  const url = new URL(apiUrl);

  return await new Promise((resolve, reject) => {
    const req = request(url, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(requestBody),
        // Airtel's Kong edge accepts curl/node:https but rejects Node fetch's default undici request shape.
        "user-agent": "curl/8.7.1",
      },
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        responseBody += chunk;
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          body: responseBody,
        });
      });
    });

    req.on("error", reject);
    req.end(requestBody);
  });
}

async function sendOtpSmsViaBhash(options: { phoneNumber: string, otp: string, message: string }): Promise<void> {
  const apiUrl = getEnvVariable("STACK_BHASH_SMS_URL", getEnvVariable("BHASH_SMS_URL", "https://bhashsms.com/api/sendmsg.php"));
  const user = getEnvVariable("STACK_BHASH_USER", getEnvVariable("BHASH_USER", ""));
  const password = getEnvVariable("STACK_BHASH_PASS", getEnvVariable("BHASH_PASS", ""));
  const senderId = getEnvVariable("STACK_BHASH_SENDER_ID", getEnvVariable("BHASH_SENDER_ID", ""));
  const priority = getEnvVariable("STACK_BHASH_PRIORITY", getEnvVariable("BHASH_PRIORITY", "ndnd"));
  const stype = getEnvVariable("STACK_BHASH_STYPE", getEnvVariable("BHASH_STYPE", "normal"));

  if (!user || !password || !senderId) {
    throw new StackAssertionError("Bhash SMS provider is missing required STACK_BHASH_* environment variables");
  }

  const url = new URL(apiUrl);
  url.searchParams.set("user", user);
  url.searchParams.set("pass", password);
  url.searchParams.set("sender", senderId);
  url.searchParams.set("phone", formatIndianPhoneForBhash(options.phoneNumber));
  url.searchParams.set("text", options.message);
  url.searchParams.set("priority", priority);
  url.searchParams.set("stype", stype);

  const response = await fetch(url, {
    method: "GET",
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "unknown");
    throw new StackAssertionError(`Failed to send SMS via Bhash API: ${response.status} ${responseBody}`);
  }

  const responseBody = (await response.text()).trim();
  const responseTokens = responseBody.split(/\s+/).filter((token) => token.length > 0);
  if (responseTokens.length === 0 || responseTokens.some((token) => !token.startsWith("S."))) {
    throw new StackAssertionError(`Failed to send SMS via Bhash API: ${response.status} ${responseBody || "empty response"}`);
  }

  console.info("Bhash SMS accepted OTP message", { messageIds: responseTokens });
}

async function sendOtpViaWhatsApp(options: { phoneNumber: string, otp: string }): Promise<void> {
  const apiUrl = getEnvVariable("STACK_AIRIX_WHATSAPP_API_URL", "https://api-whatsapp.theairix.com/api/v1/messages");
  const bearerToken = getEnvVariable("STACK_AIRIX_WHATSAPP_BEARER_TOKEN", "");
  const accountId = getEnvVariable("STACK_AIRIX_WHATSAPP_ACCOUNT_ID", "");
  const templateName = getEnvVariable("STACK_AIRIX_WHATSAPP_TEMPLATE_NAME", "manju_groups_otp");
  const languageCode = getEnvVariable("STACK_AIRIX_WHATSAPP_LANGUAGE_CODE", "en");
  const metadataUseCase = getEnvVariable("STACK_AIRIX_WHATSAPP_METADATA_USE_CASE", "login_otp");

  if (!bearerToken || !accountId) {
    throw new StackAssertionError("Airix WhatsApp provider is missing required STACK_AIRIX_WHATSAPP_* environment variables");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${bearerToken}`,
      "content-type": "application/json",
      "idempotency-key": `otp-${formatPhoneForCountryCodeProvider(options.phoneNumber)}-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      accountId,
      to: formatPhoneForCountryCodeProvider(options.phoneNumber),
      type: "template",
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: options.otp,
              },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              {
                type: "text",
                text: options.otp,
              },
            ],
          },
        ],
      },
      metadata: {
        useCase: metadataUseCase,
      },
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "unknown");
    throw new StackAssertionError(`Failed to send OTP via Airix WhatsApp API: ${response.status} ${responseBody}`);
  }

  const responseBody = await response.text();
  const parsedResponse: unknown = JSON.parse(responseBody);
  if (
    typeof parsedResponse !== "object"
    || parsedResponse === null
    || !("status" in parsedResponse)
    || parsedResponse.status !== "ok"
  ) {
    throw new StackAssertionError(`Failed to send OTP via Airix WhatsApp API: ${response.status} ${responseBody}`);
  }

  console.info("Airix WhatsApp accepted OTP message", { response: parsedResponse });
}
