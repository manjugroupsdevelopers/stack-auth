export type ExecuteResult =
  | { status: 'ok', data: unknown }
  | { status: 'error', error: { message: string, stack?: string, cause?: unknown } };

export type ExecuteRequest = {
  code: string,
  nodeModules: Record<string, string>,
  requestId: string,
  timeoutMs?: number,
};

export type RunnerCallbackBody = {
  executionId: string,
  requestId: string,
  result: ExecuteResult,
};
