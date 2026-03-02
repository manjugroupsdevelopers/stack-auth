import type { ExecuteResult } from './types';

export type ExecutionStatus = 'running' | 'completed';

type ExecutionRecord = {
  executionId: string,
  requestId: string,
  status: ExecutionStatus,
  result?: ExecuteResult,
  createdAtMs: number,
  expiresAtMs: number,
  waiters: Array<(result: ExecuteResult) => void>,
};

export class ExecutionStore {
  private readonly byExecutionId = new Map<string, ExecutionRecord>();
  private readonly requestIdToExecutionId = new Map<string, string>();

  constructor(private readonly ttlMs: number) {}

  getByRequestId(requestId: string): ExecutionRecord | undefined {
    const executionId = this.requestIdToExecutionId.get(requestId);
    if (executionId == null) return undefined;
    return this.byExecutionId.get(executionId);
  }

  create(executionId: string, requestId: string): ExecutionRecord {
    const now = Date.now();
    const record: ExecutionRecord = {
      executionId,
      requestId,
      status: 'running',
      createdAtMs: now,
      expiresAtMs: now + this.ttlMs,
      waiters: [],
    };
    this.byExecutionId.set(executionId, record);
    this.requestIdToExecutionId.set(requestId, executionId);
    return record;
  }

  complete(executionId: string, result: ExecuteResult): boolean {
    const record = this.byExecutionId.get(executionId);
    if (record == null || record.status === 'completed') return false;
    record.status = 'completed';
    record.result = result;
    for (const waiter of record.waiters) {
      waiter(result);
    }
    record.waiters = [];
    return true;
  }

  async waitForResult(executionId: string, timeoutMs: number): Promise<ExecuteResult | null> {
    const record = this.byExecutionId.get(executionId);
    if (record == null) return null;
    if (record.status === 'completed' && record.result != null) return record.result;

    return await new Promise<ExecuteResult | null>((resolve) => {
      const timeoutHandle = setTimeout(() => resolve(null), timeoutMs);
      record.waiters.push((result) => {
        clearTimeout(timeoutHandle);
        resolve(result);
      });
    });
  }

  cleanupExpired(nowMs = Date.now()) {
    for (const [executionId, record] of this.byExecutionId.entries()) {
      if (record.expiresAtMs <= nowMs) {
        this.byExecutionId.delete(executionId);
        this.requestIdToExecutionId.delete(record.requestId);
      }
    }
  }
}
