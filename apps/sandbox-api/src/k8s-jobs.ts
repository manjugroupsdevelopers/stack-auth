import { BatchV1Api, CoreV1Api, KubeConfig, V1Job } from '@kubernetes/client-node';

export type RunnerJobInput = {
  executionId: string,
  requestId: string,
  timeoutMs: number,
  code: string,
  nodeModules: Record<string, string>,
  tenantLabel?: string,
};

type RunnerJobBuildOptions = {
  namespace: string,
  runnerImage: string,
  serviceAccountName: string,
  callbackBaseUrl: string,
  callbackToken: string,
  jobTtlSecondsAfterFinished: number,
  runnerActiveDeadlineSeconds: number,
  allowedModulesRaw: string,
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getNamespace(): string {
  return process.env.STACK_SANDBOX_JOB_NAMESPACE || 'stack-auth-sandbox';
}

function getRunnerImage(): string {
  return getRequiredEnv('STACK_SANDBOX_RUNNER_IMAGE');
}

function getServiceAccountName(): string {
  return process.env.STACK_SANDBOX_RUNNER_SERVICE_ACCOUNT || 'sandbox-runner';
}

function getCallbackBaseUrl() {
  return process.env.STACK_SANDBOX_CALLBACK_BASE_URL || 'http://sandbox-api.stack-auth-sandbox.svc.cluster.local:8080';
}

function getCallbackToken() {
  return getRequiredEnv('STACK_SANDBOX_CALLBACK_TOKEN');
}

function getRunnerActiveDeadlineSeconds(): number {
  const raw = process.env.STACK_SANDBOX_RUNNER_ACTIVE_DEADLINE_SECONDS || '40';
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('STACK_SANDBOX_RUNNER_ACTIVE_DEADLINE_SECONDS must be a positive integer');
  }
  return parsed;
}

function getJobTtlSecondsAfterFinished(): number {
  const raw = process.env.STACK_SANDBOX_JOB_TTL_SECONDS || '120';
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('STACK_SANDBOX_JOB_TTL_SECONDS must be a positive integer');
  }
  return parsed;
}

function getKubeConfig() {
  const kubeConfig = new KubeConfig();
  kubeConfig.loadFromDefault();
  return kubeConfig;
}

function isNotFoundError(error: unknown) {
  if (typeof error !== 'object' || error == null) return false;
  if (!('statusCode' in error)) return false;
  return (error as { statusCode: number }).statusCode === 404;
}

export class SandboxJobClient {
  private readonly batchApi: BatchV1Api;
  private readonly coreApi: CoreV1Api;

  constructor() {
    const config = getKubeConfig();
    this.batchApi = config.makeApiClient(BatchV1Api);
    this.coreApi = config.makeApiClient(CoreV1Api);
  }

  get namespace() {
    return getNamespace();
  }

  async createJob(input: RunnerJobInput) {
    const namespace = this.namespace;
    const jobSpec = buildRunnerJobSpec(input, {
      namespace,
      runnerImage: getRunnerImage(),
      serviceAccountName: getServiceAccountName(),
      callbackBaseUrl: getCallbackBaseUrl(),
      callbackToken: getCallbackToken(),
      jobTtlSecondsAfterFinished: getJobTtlSecondsAfterFinished(),
      runnerActiveDeadlineSeconds: getRunnerActiveDeadlineSeconds(),
      allowedModulesRaw: process.env.STACK_SANDBOX_ALLOWED_MODULES ?? '',
    });

    await this.batchApi.createNamespacedJob({ namespace, body: jobSpec });
    return jobSpec.metadata?.name ?? `sandbox-run-${input.executionId}`;
  }

  async deleteJob(jobName: string) {
    try {
      await this.batchApi.deleteNamespacedJob({
        name: jobName,
        namespace: this.namespace,
        gracePeriodSeconds: 0,
        propagationPolicy: 'Foreground',
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  }

  async healthCheck(): Promise<{ kubernetesApiReachable: boolean, message?: string }> {
    try {
      await this.coreApi.listNamespacedPod({ namespace: this.namespace, limit: 1 });
      return { kubernetesApiReachable: true };
    } catch (error) {
      return {
        kubernetesApiReachable: false,
        message: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }
}

export function buildRunnerJobSpec(input: RunnerJobInput, options: RunnerJobBuildOptions): V1Job {
  const jobName = `sandbox-run-${input.executionId}`;
  const payloadJson = JSON.stringify({
    executionId: input.executionId,
    requestId: input.requestId,
    timeoutMs: input.timeoutMs,
    code: input.code,
    nodeModules: input.nodeModules,
  });

  const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64');
  const callbackUrl = `${options.callbackBaseUrl.replace(/\/$/, '')}/internal/job-result/${input.executionId}`;

  return {
    metadata: {
      name: jobName,
      labels: {
        'app.kubernetes.io/name': 'sandbox-runner',
        'stack.sandbox/execution-id': input.executionId,
        'stack.sandbox/request-id': input.requestId,
        'stack.sandbox/tenant': input.tenantLabel ?? 'unknown',
      },
    },
    spec: {
      ttlSecondsAfterFinished: options.jobTtlSecondsAfterFinished,
      backoffLimit: 0,
      activeDeadlineSeconds: options.runnerActiveDeadlineSeconds,
      template: {
        metadata: {
          labels: {
            'app.kubernetes.io/name': 'sandbox-runner',
            'stack.sandbox/execution-id': input.executionId,
          },
        },
        spec: {
            serviceAccountName: options.serviceAccountName,
            imagePullSecrets: [
              { name: process.env.STACK_SANDBOX_RUNNER_IMAGE_PULL_SECRET || 'acr-secret' },
            ],
            restartPolicy: 'Never',
          securityContext: {
            runAsNonRoot: true,
          },
          containers: [
              {
                name: 'runner',
                image: options.runnerImage,
                volumeMounts: [
                  { name: 'tmp', mountPath: '/tmp' },
                ],
                env: [
                { name: 'RUNNER_EXECUTION_PAYLOAD_B64', value: payloadB64 },
                { name: 'RUNNER_CALLBACK_URL', value: callbackUrl },
                { name: 'RUNNER_CALLBACK_TOKEN', value: options.callbackToken },
                { name: 'STACK_SANDBOX_ALLOWED_MODULES', value: options.allowedModulesRaw },
                { name: 'HOME', value: '/tmp' },
                { name: 'npm_config_cache', value: '/tmp/.npm' },
              ],
              resources: {
                requests: { cpu: '100m', memory: '192Mi' },
                limits: { cpu: '500m', memory: '512Mi' },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                runAsNonRoot: true,
                capabilities: { drop: ['ALL'] },
                seccompProfile: { type: 'RuntimeDefault' },
              },
            },
            ],
            volumes: [
              { name: 'tmp', emptyDir: {} },
            ],
          },
        },
      },
  };
}
