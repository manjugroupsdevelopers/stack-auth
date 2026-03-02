import { getEnvVariable } from '@stackframe/stack-shared/dist/utils/env';
import { StackAssertionError } from '@stackframe/stack-shared/dist/utils/errors';
import { randomUUID } from 'node:crypto';
import type { ExecuteJavascriptOptions, ExecuteResult } from './js-execution';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CODE_BYTES = 256 * 1024;
const DEFAULT_MAX_DEPENDENCIES = 8;
const DEFAULT_ALLOWED_MODULES = 'react@19.1.1,react-dom@19.1.1,@react-email/components@1.0.6,arktype@2.1.20';

function getAllowedModules() {
  const raw = getEnvVariable('STACK_SANDBOX_ALLOWED_MODULES', DEFAULT_ALLOWED_MODULES);
  const entries = raw.split(',').map(item => item.trim()).filter(item => item.length > 0);
  const map = new Map<string, string>();
  for (const entry of entries) {
    const separatorIndex = entry.lastIndexOf('@');
    if (separatorIndex <= 0) {
      throw new StackAssertionError('Invalid STACK_SANDBOX_ALLOWED_MODULES entry', { entry });
    }
    const name = entry.slice(0, separatorIndex);
    const version = entry.slice(separatorIndex + 1);
    map.set(name, version);
  }
  return map;
}

type ExecuteRequestPayload = {
  code: string,
  nodeModules: Record<string, string>,
  requestId: string,
  timeoutMs: number,
};

function getConfiguredTimeoutMs(): number {
  const raw = getEnvVariable('STACK_SANDBOX_TIMEOUT_MS', `${DEFAULT_TIMEOUT_MS}`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new StackAssertionError('STACK_SANDBOX_TIMEOUT_MS must be a positive integer', { raw });
  }
  return parsed;
}

function validatePayloadLimits(code: string, nodeModules: Record<string, string>) {
  const codeBytes = Buffer.byteLength(code, 'utf8');
  if (codeBytes > DEFAULT_MAX_CODE_BYTES) {
    throw new StackAssertionError('Sandbox code payload exceeds maximum size', {
      codeBytes,
      maxCodeBytes: DEFAULT_MAX_CODE_BYTES,
    });
  }

  const moduleEntries = Object.entries(nodeModules);
  const allowedNodeModules = getAllowedModules();
  if (moduleEntries.length > DEFAULT_MAX_DEPENDENCIES) {
    throw new StackAssertionError('Sandbox dependency count exceeds maximum', {
      dependencyCount: moduleEntries.length,
      maxDependencies: DEFAULT_MAX_DEPENDENCIES,
    });
  }

  for (const [name, version] of moduleEntries) {
    const allowedVersion = allowedNodeModules.get(name);
    if (allowedVersion == null) {
      throw new StackAssertionError('Sandbox dependency is not allowlisted', {
        module: name,
        allowlistedModules: [...allowedNodeModules.keys()],
      });
    }
    if (allowedVersion !== version) {
      throw new StackAssertionError('Sandbox dependency version is not allowlisted', {
        module: name,
        requestedVersion: version,
        allowedVersion,
      });
    }
  }
}

function toExecuteError(message: string, cause?: unknown): ExecuteResult {
  return {
    status: 'error',
    error: {
      message,
      cause,
    },
  };
}

function sanitizeExecuteResult(data: unknown): ExecuteResult {
  if (
    typeof data === 'object' &&
    data !== null &&
    'status' in data &&
    ((data as { status?: string }).status === 'ok' || (data as { status?: string }).status === 'error')
  ) {
    return data as ExecuteResult;
  }

  return toExecuteError('Sandbox API returned an invalid execute result payload', { data });
}

export function isSelfHostedSandboxConfigured() {
  return getEnvVariable('STACK_SANDBOX_API_URL', '') !== '' && getEnvVariable('STACK_SANDBOX_API_TOKEN', '') !== '';
}

export async function executeJavascriptViaSandboxApi(code: string, options: ExecuteJavascriptOptions = {}): Promise<ExecuteResult> {
  try {
    if (!isSelfHostedSandboxConfigured()) {
      return toExecuteError('Self-hosted sandbox is not configured. Set STACK_SANDBOX_API_URL and STACK_SANDBOX_API_TOKEN.');
    }

    const nodeModules = options.nodeModules ?? {};
    validatePayloadLimits(code, nodeModules);

    const timeoutMs = getConfiguredTimeoutMs();
    const apiUrl = getEnvVariable('STACK_SANDBOX_API_URL');
    const token = getEnvVariable('STACK_SANDBOX_API_TOKEN');

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    const payload: ExecuteRequestPayload = {
      code,
      nodeModules,
      requestId: randomUUID(),
      timeoutMs,
    };

    let response: Response;
    try {
      response = await fetch(`${apiUrl.replace(/\/$/, '')}/execute`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return toExecuteError(`Self-hosted sandbox request timed out after ${timeoutMs}ms`, { timeoutMs });
      }
      return toExecuteError('Self-hosted sandbox request failed', { cause: error });
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!response.ok) {
      return toExecuteError('Self-hosted sandbox request failed with non-2xx status', {
        status: response.status,
      });
    }

    const json = await response.json();
    return sanitizeExecuteResult(json);
  } catch (error) {
    return toExecuteError('Self-hosted sandbox execution failed before request dispatch', { cause: error });
  }
}
