import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeJavascriptViaSandboxApi } from './sandbox-execution-client';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('executeJavascriptViaSandboxApi', () => {
  it('returns timeout error on aborted requests', async () => {
    vi.stubEnv('STACK_SANDBOX_API_URL', 'http://sandbox-api');
    vi.stubEnv('STACK_SANDBOX_API_TOKEN', 'secret');
    vi.stubEnv('STACK_SANDBOX_TIMEOUT_MS', '50');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));

    const result = await executeJavascriptViaSandboxApi('export default async () => 1;', {});
    expect(result).toMatchObject({
      status: 'error',
      error: { message: 'Self-hosted sandbox request timed out after 50ms' },
    });
  });

  it('returns transport error for non-ok responses', async () => {
    vi.stubEnv('STACK_SANDBOX_API_URL', 'http://sandbox-api');
    vi.stubEnv('STACK_SANDBOX_API_TOKEN', 'secret');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));

    const result = await executeJavascriptViaSandboxApi('export default async () => 1;', {});
    expect(result).toMatchObject({
      status: 'error',
      error: { message: 'Self-hosted sandbox request failed with non-2xx status' },
    });
  });
});
