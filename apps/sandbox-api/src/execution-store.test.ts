import { describe, expect, it } from 'vitest';
import { ExecutionStore } from './execution-store';

describe('ExecutionStore', () => {
  it('supports idempotent waiters and completion', async () => {
    const store = new ExecutionStore(60_000);
    store.create('exec-1', 'req-1');

    const waiter = store.waitForResult('exec-1', 5000);
    store.complete('exec-1', { status: 'ok', data: { html: 'x' } });

    await expect(waiter).resolves.toEqual({ status: 'ok', data: { html: 'x' } });
    expect(store.getByRequestId('req-1')?.status).toBe('completed');
  });

  it('expires stale executions', () => {
    const store = new ExecutionStore(1);
    store.create('exec-1', 'req-1');
    store.cleanupExpired(Date.now() + 5);
    expect(store.getByRequestId('req-1')).toBeUndefined();
  });
});
