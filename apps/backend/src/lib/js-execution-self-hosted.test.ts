import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeJavascript, getJsExecutionEngineMode } from './js-execution';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('executeJavascript (self-hosted-sandbox)', () => {
  it('selects self-hosted mode when configured', () => {
    vi.stubEnv('STACK_JS_EXECUTION_ENGINE', 'self-hosted-sandbox');
    expect(getJsExecutionEngineMode()).toBe('self-hosted-sandbox');
  });

  it('selects self-hosted engine when configured', async () => {
    vi.stubEnv('STACK_JS_EXECUTION_ENGINE', 'self-hosted-sandbox');
    vi.stubEnv('STACK_SANDBOX_API_URL', 'http://sandbox-api');
    vi.stubEnv('STACK_SANDBOX_API_TOKEN', 'token');

    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', data: { html: '<div/>' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await executeJavascript('export default async () => ({ status: "ok", data: { html: "<div/>" } });');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 'ok', data: { html: '<div/>' } });
  });

  it('maps timeout to deterministic error', async () => {
    vi.stubEnv('STACK_JS_EXECUTION_ENGINE', 'self-hosted-sandbox');
    vi.stubEnv('STACK_SANDBOX_API_URL', 'http://sandbox-api');
    vi.stubEnv('STACK_SANDBOX_API_TOKEN', 'token');
    vi.stubEnv('STACK_SANDBOX_TIMEOUT_MS', '99');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));

    const result = await executeJavascript('export default async () => ({ status: "ok", data: 1 });');

    expect(result).toMatchObject({
      status: 'error',
      error: {
        message: 'Self-hosted sandbox request timed out after 99ms',
      },
    });
  });

  it('maps 5xx to execute error payload', async () => {
    vi.stubEnv('STACK_JS_EXECUTION_ENGINE', 'self-hosted-sandbox');
    vi.stubEnv('STACK_SANDBOX_API_URL', 'http://sandbox-api');
    vi.stubEnv('STACK_SANDBOX_API_TOKEN', 'token');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 500 })));

    const result = await executeJavascript('export default async () => ({ status: "ok", data: 1 });');

    expect(result).toMatchObject({
      status: 'error',
      error: {
        message: 'Self-hosted sandbox request failed with non-2xx status',
      },
    });
  });
});
