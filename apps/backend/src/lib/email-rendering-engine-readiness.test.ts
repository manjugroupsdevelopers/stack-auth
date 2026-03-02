import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertEmailRenderingEngineReadyForSendEmailEndpoint } from './email-rendering-engine-readiness';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('assertEmailRenderingEngineReadyForSendEmailEndpoint', () => {
  it('does not require freestyle key in self-hosted mode', () => {
    vi.stubEnv('STACK_JS_EXECUTION_ENGINE', 'self-hosted-sandbox');
    vi.stubEnv('STACK_SANDBOX_API_URL', 'http://sandbox-api');
    vi.stubEnv('STACK_SANDBOX_API_TOKEN', 'secret');
    vi.stubEnv('STACK_FREESTYLE_API_KEY', '');

    expect(() => assertEmailRenderingEngineReadyForSendEmailEndpoint()).not.toThrow();
  });

  it('requires freestyle key in legacy mode', () => {
    vi.stubEnv('STACK_JS_EXECUTION_ENGINE', 'legacy');
    vi.stubEnv('STACK_FREESTYLE_API_KEY', '');

    expect(() => assertEmailRenderingEngineReadyForSendEmailEndpoint()).toThrow('Missing environment variable: STACK_FREESTYLE_API_KEY');
  });
});
