import { describe, expect, it } from 'vitest';
import { buildRunnerJobSpec } from './k8s-jobs';

describe('buildRunnerJobSpec', () => {
  it('creates a hardened one-shot job spec with encoded payload', () => {
    const spec = buildRunnerJobSpec({
      executionId: 'exec-1',
      requestId: 'req-1',
      timeoutMs: 30_000,
      code: 'export default async () => 1;',
      nodeModules: { react: '19.1.1' },
      tenantLabel: 'email-rendering',
    }, {
      namespace: 'stack-auth-sandbox',
      runnerImage: 'stackauth/sandbox-runner:latest',
      serviceAccountName: 'sandbox-runner',
      callbackBaseUrl: 'http://sandbox-api.stack-auth-sandbox.svc.cluster.local:8080',
      callbackToken: 'callback-token',
      jobTtlSecondsAfterFinished: 120,
      runnerActiveDeadlineSeconds: 40,
      allowedModulesRaw: 'react@19.1.1',
    });

    const container = spec.spec?.template.spec?.containers[0];
    const env = new Map((container?.env ?? []).map(item => [item.name, item.value ?? '']));

    expect(spec.metadata?.name).toBe('sandbox-run-exec-1');
    expect(spec.spec?.activeDeadlineSeconds).toBe(40);
    expect(spec.spec?.ttlSecondsAfterFinished).toBe(120);
    expect(container?.securityContext).toMatchObject({
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
      runAsNonRoot: true,
      seccompProfile: { type: 'RuntimeDefault' },
    });
    expect(env.get('RUNNER_CALLBACK_URL')).toBe('http://sandbox-api.stack-auth-sandbox.svc.cluster.local:8080/internal/job-result/exec-1');

    const payloadB64 = env.get('RUNNER_EXECUTION_PAYLOAD_B64') ?? '';
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8')) as {
      executionId: string,
      requestId: string,
      timeoutMs: number,
      code: string,
      nodeModules: Record<string, string>,
    };

    expect(payload).toEqual({
      executionId: 'exec-1',
      requestId: 'req-1',
      timeoutMs: 30_000,
      code: 'export default async () => 1;',
      nodeModules: { react: '19.1.1' },
    });
  });
});
