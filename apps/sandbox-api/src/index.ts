import express from 'express';
import { ExecutionStore } from './execution-store';
import { SandboxJobClient } from './k8s-jobs';
import { generateExecutionId, SANDBOX_DEFAULT_TIMEOUT_MS, SANDBOX_MAX_RESULT_BYTES, validateExecuteRequest } from './policy';
import type { ExecuteResult, RunnerCallbackBody } from './types';

const app = express();
app.use(express.json({ limit: '300kb' }));

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const apiToken = process.env.STACK_SANDBOX_API_TOKEN ?? '';
const callbackToken = process.env.STACK_SANDBOX_CALLBACK_TOKEN ?? '';
const recordTtlMs = Number.parseInt(process.env.STACK_SANDBOX_REQUEST_TTL_MS ?? '120000', 10);

if (apiToken.length === 0) {
  throw new Error('STACK_SANDBOX_API_TOKEN is required');
}
if (callbackToken.length === 0) {
  throw new Error('STACK_SANDBOX_CALLBACK_TOKEN is required');
}

const store = new ExecutionStore(recordTtlMs);
const jobClient = new SandboxJobClient();

setInterval(() => {
  store.cleanupExpired();
}, 15_000).unref();

function isAuthorized(req: express.Request, token: string) {
  const header = req.header('authorization');
  return header === `Bearer ${token}`;
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

function normalizeExecuteResult(result: unknown): ExecuteResult {
  if (
    typeof result === 'object' &&
    result !== null &&
    'status' in result &&
    ((result as { status?: string }).status === 'ok' || (result as { status?: string }).status === 'error')
  ) {
    const payloadBytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
    if (payloadBytes > SANDBOX_MAX_RESULT_BYTES) {
      return toExecuteError(`sandbox result exceeded max payload size (${SANDBOX_MAX_RESULT_BYTES} bytes)`);
    }
    return result as ExecuteResult;
  }
  return toExecuteError('sandbox callback payload did not contain a valid execute result');
}

app.get('/healthz', (_req, res) => {
  const run = async () => {
    try {
      const health = await jobClient.healthCheck();
      if (!health.kubernetesApiReachable) {
        res.status(503).json({ ok: false, ...health });
        return;
      }
      res.status(200).json({ ok: true, ...health });
    } catch (error) {
      res.status(500).json(toExecuteError('health check failed', { error }));
    }
  };
  run().then(() => undefined, () => undefined);
});

app.get('/metrics', (_req, res) => {
  res.setHeader('content-type', 'text/plain; version=0.0.4');
  res.send('sandbox_api_requests_total 0\n');
});

app.post('/execute', (req, res) => {
  const run = async () => {
    try {
      const startedAt = performance.now();
      if (!isAuthorized(req, apiToken)) {
        res.status(401).json(toExecuteError('Unauthorized'));
        return;
      }

      let validated;
      try {
        validated = validateExecuteRequest(req.body);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'invalid request';
        res.status(400).json(toExecuteError(`Invalid execute request: ${message}`));
        return;
      }

      const existing = store.getByRequestId(validated.requestId);
      if (existing != null) {
        if (existing.status === 'completed' && existing.result != null) {
          res.status(200).json(existing.result);
          return;
        }

        const duplicateResult = await store.waitForResult(existing.executionId, validated.timeoutMs ?? SANDBOX_DEFAULT_TIMEOUT_MS);
        if (duplicateResult == null) {
          res.status(200).json(toExecuteError(`sandbox execution timed out after ${validated.timeoutMs}ms`, { requestId: validated.requestId }));
          return;
        }
        res.status(200).json(duplicateResult);
        return;
      }

      const executionId = generateExecutionId();
      store.create(executionId, validated.requestId);
      const jobName = `sandbox-run-${executionId}`;

      try {
        await jobClient.createJob({
          executionId,
          requestId: validated.requestId,
          timeoutMs: validated.timeoutMs ?? SANDBOX_DEFAULT_TIMEOUT_MS,
          code: validated.code,
          nodeModules: validated.nodeModules,
          tenantLabel: 'email-rendering',
        });
      } catch (error) {
        const failureResult = toExecuteError('failed to create sandbox runner job', {
          cause: error instanceof Error ? error.message : String(error),
          executionId,
        });
        store.complete(executionId, failureResult);
        res.status(200).json(failureResult);
        return;
      }

      const result = await store.waitForResult(executionId, validated.timeoutMs ?? SANDBOX_DEFAULT_TIMEOUT_MS);
      if (result == null) {
        const timeoutResult = toExecuteError(`sandbox execution timed out after ${validated.timeoutMs}ms`, {
          executionId,
          requestId: validated.requestId,
        });
        store.complete(executionId, timeoutResult);
        await jobClient.deleteJob(jobName);
        res.status(200).json(timeoutResult);
        return;
      }

      await jobClient.deleteJob(jobName);
      const durationMs = performance.now() - startedAt;
      console.log('sandbox execution completed', {
        executionId,
        requestId: validated.requestId,
        status: result.status,
        durationMs,
      });

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json(toExecuteError('sandbox execute handler failed', { error }));
    }
  };
  run().then(() => undefined, () => undefined);
});

app.post('/internal/job-result/:executionId', (req, res) => {
  if (!isAuthorized(req, callbackToken)) {
    res.status(401).json({ ok: false });
    return;
  }

  const executionId = req.params.executionId;
  const rawBody: unknown = req.body;
  if (typeof rawBody !== 'object' || rawBody === null) {
    res.status(400).json({ ok: false, error: 'invalid body' });
    return;
  }
  const body = rawBody as Partial<RunnerCallbackBody>;

  if (typeof body.executionId !== 'string' || body.executionId !== executionId) {
    res.status(400).json({ ok: false, error: 'executionId mismatch' });
    return;
  }
  if (typeof body.requestId !== 'string' || body.requestId.length === 0) {
    res.status(400).json({ ok: false, error: 'requestId is required' });
    return;
  }

  const result = normalizeExecuteResult(body.result);
  const wasCompleted = store.complete(executionId, result);
  if (!wasCompleted) {
    res.status(409).json({ ok: false, error: 'execution already completed or unknown' });
    return;
  }

  res.status(202).json({ ok: true });
});

app.listen(port, () => {
  console.log(`sandbox-api listening on :${port}`);
});
