import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderEmailWithTemplate } from './email-rendering';

const template = `
  export const variablesSchema = (v) => v;
  export function EmailTemplate() {
    return <div>Hello</div>;
  }
`;

const theme = `
  export function EmailTheme({ children }) {
    return <div>{children}</div>;
  }
`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('renderEmailWithTemplate with self-hosted sandbox', () => {
  it('returns rendered result on sandbox success', async () => {
    vi.stubEnv('STACK_JS_EXECUTION_ENGINE', 'self-hosted-sandbox');
    vi.stubEnv('STACK_SANDBOX_API_URL', 'http://sandbox-api');
    vi.stubEnv('STACK_SANDBOX_API_TOKEN', 'token');

    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/execute') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          status: 'ok',
          data: { html: '<div>Hello</div>', text: 'Hello', subject: 'Welcome' },
        }), { status: 200 });
      }
      return await originalFetch(input, init);
    }));

    const result = await renderEmailWithTemplate(template, theme, {
      user: { displayName: 'User' },
      project: { displayName: 'Project' },
      variables: {},
    });

    expect(result).toEqual({
      status: 'ok',
      data: {
        html: '<div>Hello</div>',
        text: 'Hello',
        subject: 'Welcome',
      },
    });
  });

  it('maps sandbox errors into render result errors', async () => {
    vi.stubEnv('STACK_JS_EXECUTION_ENGINE', 'self-hosted-sandbox');
    vi.stubEnv('STACK_SANDBOX_API_URL', 'http://sandbox-api');
    vi.stubEnv('STACK_SANDBOX_API_TOKEN', 'token');

    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/execute') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          status: 'error',
          error: { message: 'sandbox unavailable' },
        }), { status: 200 });
      }
      return await originalFetch(input, init);
    }));

    const result = await renderEmailWithTemplate(template, theme, {
      user: { displayName: 'User' },
      project: { displayName: 'Project' },
      variables: {},
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('sandbox unavailable');
    }
  });
});
