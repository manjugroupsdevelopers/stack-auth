import { randomUUID } from 'node:crypto';
import type { ExecuteRequest } from './types';

const DEFAULT_ALLOWED_MODULES = 'react@19.1.1,react-dom@19.1.1,@react-email/components@1.0.6,arktype@2.1.20';

export const SANDBOX_MAX_CODE_BYTES = 256 * 1024;
export const SANDBOX_MAX_DEPENDENCIES = 8;
export const SANDBOX_MAX_RESULT_BYTES = 1024 * 1024;
export const SANDBOX_DEFAULT_TIMEOUT_MS = 30_000;
export const SANDBOX_MAX_TIMEOUT_MS = Number.parseInt(process.env.STACK_SANDBOX_MAX_TIMEOUT_MS ?? '120000', 10);

export function getAllowedModules(): Map<string, string> {
  const raw = process.env.STACK_SANDBOX_ALLOWED_MODULES ?? DEFAULT_ALLOWED_MODULES;
  const entries = raw.split(',').map(item => item.trim()).filter(item => item.length > 0);
  const map = new Map<string, string>();
  for (const entry of entries) {
    const separatorIndex = entry.lastIndexOf('@');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid STACK_SANDBOX_ALLOWED_MODULES entry: ${entry}`);
    }
    const name = entry.slice(0, separatorIndex);
    const version = entry.slice(separatorIndex + 1);
    map.set(name, version);
  }
  return map;
}

export function normalizeTimeoutMs(timeoutMs: number | undefined): number {
  if (timeoutMs == null) return SANDBOX_DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive number');
  }
  return Math.min(Math.floor(timeoutMs), SANDBOX_MAX_TIMEOUT_MS);
}

export function validateExecuteRequest(body: unknown): ExecuteRequest {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Request body must be an object');
  }

  const request = body as Partial<ExecuteRequest>;
  const rawRequest = body as { nodeModules?: unknown };
  if (typeof request.code !== 'string' || request.code.length === 0) {
    throw new Error('code must be a non-empty string');
  }
  if (Buffer.byteLength(request.code, 'utf8') > SANDBOX_MAX_CODE_BYTES) {
    throw new Error(`code exceeds ${SANDBOX_MAX_CODE_BYTES} bytes`);
  }

  if (typeof request.requestId !== 'string' || request.requestId.length === 0) {
    throw new Error('requestId must be a non-empty string');
  }

  const nodeModules = rawRequest.nodeModules ?? {};
  if (typeof nodeModules !== 'object' || Array.isArray(nodeModules)) {
    throw new Error('nodeModules must be an object');
  }

  const entries = Object.entries(nodeModules);
  if (entries.length > SANDBOX_MAX_DEPENDENCIES) {
    throw new Error(`nodeModules exceeds ${SANDBOX_MAX_DEPENDENCIES} dependencies`);
  }

  const allowedModules = getAllowedModules();
  for (const [name, version] of entries) {
    if (typeof version !== 'string' || version.length === 0) {
      throw new Error(`nodeModules.${name} must be a non-empty string`);
    }
    const allowedVersion = allowedModules.get(name);
    if (allowedVersion == null) {
      throw new Error(`nodeModules.${name} is not allowlisted`);
    }
    if (allowedVersion !== version) {
      throw new Error(`nodeModules.${name} version ${version} is not allowlisted (expected ${allowedVersion})`);
    }
  }

  return {
    code: request.code,
    nodeModules: nodeModules as Record<string, string>,
    requestId: request.requestId,
    timeoutMs: normalizeTimeoutMs(request.timeoutMs),
  };
}

export function generateExecutionId() {
  return randomUUID();
}

import.meta.vitest?.describe('validateExecuteRequest', () => {
  import.meta.vitest?.it('rejects disallowed module', ({ expect }) => {
    expect(() => validateExecuteRequest({
      code: 'export default async () => 1;',
      requestId: 'req-1',
      nodeModules: { lodash: '4.17.21' },
    })).toThrow('not allowlisted');
  });
});
