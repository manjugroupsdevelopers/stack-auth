import { getJsExecutionEngineMode } from '@/lib/js-execution';
import { isSelfHostedSandboxConfigured } from '@/lib/sandbox-execution-client';
import { getEnvVariable } from '@stackframe/stack-shared/dist/utils/env';
import { StatusError } from '@stackframe/stack-shared/dist/utils/errors';

export function assertEmailRenderingEngineReadyForSendEmailEndpoint() {
  const executionEngine = getJsExecutionEngineMode();
  if (executionEngine === 'self-hosted-sandbox') {
    if (!isSelfHostedSandboxConfigured()) {
      throw new StatusError(500, 'Self-hosted sandbox is not configured (STACK_SANDBOX_API_URL and STACK_SANDBOX_API_TOKEN are required)');
    }
    return;
  }

  if (!getEnvVariable('STACK_FREESTYLE_API_KEY')) {
    throw new StatusError(500, 'STACK_FREESTYLE_API_KEY is not set');
  }
}
