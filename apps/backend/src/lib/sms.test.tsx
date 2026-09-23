import { afterEach, describe, expect, it, vi } from 'vitest';
import { StackAssertionError } from '@stackframe/stack-shared/dist/utils/errors';
import { sendOtpSms } from './sms';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('sendOtpSms', () => {
  it('sends phone OTPs through Airix', async () => {
    vi.stubEnv('STACK_SMS_PROVIDER', 'airix');
    vi.stubEnv('STACK_AIRIX_SMS_API_URL', 'https://api-mfpl.theairix.com/api/integrations/otp/send');
    vi.stubEnv('STACK_AIRIX_SMS_API_KEY', 'test-api-key');
    vi.stubEnv('STACK_AIRIX_SMS_APP_ID', 'airix-meet');

    const fetchMock = vi.fn(async (url: unknown) => {
      if (url instanceof URL) {
        return new Response('S.123456', { status: 200 });
      }
      return new Response(JSON.stringify({
        status: "ok",
        data: {
          jobId: "test-job-id",
          messageId: "test-message-id",
          status: "queued",
          statusUrl: "/api/v1/messages/test-message-id",
        },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await sendOtpSms({
      phoneNumber: '+916369487527',
      otp: '123456',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://api-mfpl.theairix.com/api/integrations/otp/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-api-key',
      },
      body: JSON.stringify({
        phone: '916369487527',
        otp: '123456',
        appId: 'airix-meet',
        messageType: 'verification',
      }),
    });
  });

  it('fails loudly when Airix API key is missing', async () => {
    vi.stubEnv('STACK_SMS_PROVIDER', 'airix');
    vi.stubEnv('STACK_AIRIX_SMS_API_KEY', '');

    await expect(sendOtpSms({
      phoneNumber: '+916369487527',
      otp: '123456',
    })).rejects.toThrow(StackAssertionError);
  });

  it('sends phone OTPs through both Bhash SMS and Airix WhatsApp', async () => {
    vi.stubEnv('STACK_SMS_PROVIDER', 'bhash-whatsapp');
    vi.stubEnv('STACK_SMS_OTP_MESSAGE_TEMPLATE', 'Manju Groups: Your login OTP is {otp}. This code is valid for 10 minutes. Do not share this OTP with anyone. If you did not request it, please ignore this message.');
    vi.stubEnv('STACK_BHASH_SMS_URL', 'https://bhashsms.com/api/sendmsg.php');
    vi.stubEnv('STACK_BHASH_USER', 'Manjupromoters');
    vi.stubEnv('STACK_BHASH_PASS', 'test-password');
    vi.stubEnv('STACK_BHASH_SENDER_ID', 'MNJUGR');
    vi.stubEnv('STACK_BHASH_PRIORITY', 'ndnd');
    vi.stubEnv('STACK_BHASH_STYPE', 'normal');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_API_URL', 'https://api-whatsapp.theairix.com/api/v1/messages');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_BEARER_TOKEN', 'test-whatsapp-token');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_ACCOUNT_ID', 'a20a8238-14cd-4c5c-8db0-71c1975366d1');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_TEMPLATE_NAME', 'manju_groups_otp');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_LANGUAGE_CODE', 'en');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_METADATA_USE_CASE', 'login_otp');

    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
    const fetchMock = vi.fn(async (url: unknown) => {
      if (url instanceof URL) {
        return new Response('S.123456', { status: 200 });
      }
      return new Response(JSON.stringify({
        status: "ok",
        data: {
          jobId: "test-job-id",
          messageId: "test-message-id",
          status: "queued",
          statusUrl: "/api/v1/messages/test-message-id",
        },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await sendOtpSms({
      phoneNumber: '+916369487527',
      otp: '123456',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bhashUrl = fetchMock.mock.calls[0]?.[0];
    expect(bhashUrl).toBeInstanceOf(URL);
    expect((bhashUrl as URL).origin + (bhashUrl as URL).pathname).toBe('https://bhashsms.com/api/sendmsg.php');
    expect((bhashUrl as URL).searchParams.get('user')).toBe('Manjupromoters');
    expect((bhashUrl as URL).searchParams.get('pass')).toBe('test-password');
    expect((bhashUrl as URL).searchParams.get('sender')).toBe('MNJUGR');
    expect((bhashUrl as URL).searchParams.get('phone')).toBe('6369487527');
    expect((bhashUrl as URL).searchParams.get('text')).toBe('Manju Groups: Your login OTP is 123456. This code is valid for 10 minutes. Do not share this OTP with anyone. If you did not request it, please ignore this message.');
    expect((bhashUrl as URL).searchParams.get('priority')).toBe('ndnd');
    expect((bhashUrl as URL).searchParams.get('stype')).toBe('normal');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchInlineSnapshot(`
      {
        "method": "GET",
      }
    `);

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api-whatsapp.theairix.com/api/v1/messages');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer test-whatsapp-token',
        'content-type': 'application/json',
        'idempotency-key': 'otp-916369487527-00000000-0000-4000-8000-000000000000',
      },
    });
    const whatsappBody = fetchMock.mock.calls[1]?.[1]?.body;
    expect(typeof whatsappBody).toBe('string');
    if (typeof whatsappBody !== 'string') {
      throw new StackAssertionError('Expected WhatsApp request body to be a string');
    }
    expect(JSON.parse(whatsappBody)).toMatchInlineSnapshot(`
      {
        "accountId": "a20a8238-14cd-4c5c-8db0-71c1975366d1",
        "metadata": {
          "useCase": "login_otp",
        },
        "template": {
          "components": [
            {
              "parameters": [
                {
                  "text": "123456",
                  "type": "text",
                },
              ],
              "type": "body",
            },
            {
              "index": "0",
              "parameters": [
                {
                  "text": "123456",
                  "type": "text",
                },
              ],
              "sub_type": "url",
              "type": "button",
            },
          ],
          "language": {
            "code": "en",
          },
          "name": "manju_groups_otp",
        },
        "to": "916369487527",
        "type": "template",
      }
    `);
  });

  it('fails loudly when Bhash SMS configuration is missing', async () => {
    vi.stubEnv('STACK_SMS_PROVIDER', 'bhash-whatsapp');
    vi.stubEnv('STACK_BHASH_USER', 'Manjupromoters');
    vi.stubEnv('STACK_BHASH_PASS', '');
    vi.stubEnv('STACK_BHASH_SENDER_ID', 'MNJUGR');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_BEARER_TOKEN', 'test-whatsapp-token');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_ACCOUNT_ID', 'a20a8238-14cd-4c5c-8db0-71c1975366d1');

    await expect(sendOtpSms({
      phoneNumber: '+916369487527',
      otp: '123456',
    })).rejects.toThrow(StackAssertionError);
  });

  it('sends phone OTPs through both Airtel SMS and Airix WhatsApp', async () => {
    vi.stubEnv('STACK_SMS_PROVIDER', 'airtel-whatsapp');
    vi.stubEnv('STACK_SMS_OTP_MESSAGE_TEMPLATE', '{otp} is the OTP to signup on AIVIDA. Valid for 10 minutes. Do not share this with anyone.');
    vi.stubEnv('STACK_AIRTEL_SMS_API_URL', 'https://iqsms.airtel.in/api/v1/send-prepaid-sms');
    vi.stubEnv('STACK_AIRTEL_SMS_CUSTOMER_ID', '8dfa792b-7695-4054-ad5b-0ac872a05453');
    vi.stubEnv('STACK_AIRTEL_SMS_DLT_TEMPLATE_ID', '1007495382194071124');
    vi.stubEnv('STACK_AIRTEL_SMS_ENTITY_ID', '1001711943218436692');
    vi.stubEnv('STACK_AIRTEL_SMS_MESSAGE_TYPE', 'SERVICE_IMPLICIT');
    vi.stubEnv('STACK_AIRTEL_SMS_SOURCE_ADDRESS', 'MNJWLL');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_API_URL', 'https://api-whatsapp.theairix.com/api/v1/messages');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_BEARER_TOKEN', 'test-whatsapp-token');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_ACCOUNT_ID', 'a20a8238-14cd-4c5c-8db0-71c1975366d1');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_TEMPLATE_NAME', 'manju_groups_otp');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_LANGUAGE_CODE', 'en');
    vi.stubEnv('STACK_AIRIX_WHATSAPP_METADATA_USE_CASE', 'login_otp');

    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
    const fetchMock = vi.fn(async (url: unknown) => {
      if (url === 'https://iqsms.airtel.in/api/v1/send-prepaid-sms') {
        return new Response(JSON.stringify({
          customerId: '8dfa792b-7695-4054-ad5b-0ac872a05453',
          destinationAddress: ['+916369487527'],
          dltTemplateId: '1007495382194071124',
          entityId: '1001711943218436692',
          incorrectNum: [],
          message: '123456 is the OTP to signup on AIVIDA. Valid for 10 minutes. Do not share this with anyone.',
          messageRequestId: '496db4a7-41fc-40b3-88f6-36c8d0cfd4b8',
          messageType: 'SERVICE_IMPLICIT',
          metaData: {
            subAccountId: '98e36d7a-d6c2-4d0e-8647-d29b30973ebd',
            mdrCategory: 'NOTP',
          },
          sourceAddress: 'MNJWLL',
        }), { status: 200 });
      }

      return new Response(JSON.stringify({
        status: "ok",
        data: {
          jobId: "test-job-id",
          messageId: "test-message-id",
          status: "queued",
          statusUrl: "/api/v1/messages/test-message-id",
        },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await sendOtpSms({
      phoneNumber: '+916369487527',
      otp: '123456',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://iqsms.airtel.in/api/v1/send-prepaid-sms');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
    });
    const airtelBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(typeof airtelBody).toBe('string');
    if (typeof airtelBody !== 'string') {
      throw new StackAssertionError('Expected Airtel request body to be a string');
    }
    expect(JSON.parse(airtelBody)).toMatchInlineSnapshot(`
      {
        "customerId": "8dfa792b-7695-4054-ad5b-0ac872a05453",
        "destinationAddress": [
          "+916369487527",
        ],
        "dltTemplateId": "1007495382194071124",
        "entityId": "1001711943218436692",
        "message": "123456 is the OTP to signup on AIVIDA. Valid for 10 minutes. Do not share this with anyone.",
        "messageType": "SERVICE_IMPLICIT",
        "sourceAddress": "MNJWLL",
      }
    `);

    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api-whatsapp.theairix.com/api/v1/messages');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer test-whatsapp-token',
        'content-type': 'application/json',
        'idempotency-key': 'otp-916369487527-00000000-0000-4000-8000-000000000000',
      },
    });
    const whatsappBody = fetchMock.mock.calls[1]?.[1]?.body;
    expect(typeof whatsappBody).toBe('string');
    if (typeof whatsappBody !== 'string') {
      throw new StackAssertionError('Expected WhatsApp request body to be a string');
    }
    expect(JSON.parse(whatsappBody)).toMatchInlineSnapshot(`
      {
        "accountId": "a20a8238-14cd-4c5c-8db0-71c1975366d1",
        "metadata": {
          "useCase": "login_otp",
        },
        "template": {
          "components": [
            {
              "parameters": [
                {
                  "text": "123456",
                  "type": "text",
                },
              ],
              "type": "body",
            },
            {
              "index": "0",
              "parameters": [
                {
                  "text": "123456",
                  "type": "text",
                },
              ],
              "sub_type": "url",
              "type": "button",
            },
          ],
          "language": {
            "code": "en",
          },
          "name": "manju_groups_otp",
        },
        "to": "916369487527",
        "type": "template",
      }
    `);
  });
});
