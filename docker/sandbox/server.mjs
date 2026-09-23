import express from 'express';
import { mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const app = express();
app.use(express.json({ limit: '300kb' }));

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const apiToken = process.env.STACK_SANDBOX_API_TOKEN ?? '';

if (!apiToken) {
  throw new Error('STACK_SANDBOX_API_TOKEN is required');
}

const PREBUILT_NODE_MODULES_DIR = '/opt/sandbox-deps/node_modules';
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RESULT_BYTES = 1024 * 1024;

function isAuthorized(req) {
  return req.header('authorization') === `Bearer ${apiToken}`;
}

function toError(message, cause) {
  return { status: 'error', error: { message, cause } };
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.post('/execute', async (req, res) => {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json(toError('Unauthorized'));
    }

    const { code, nodeModules = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = req.body;
    if (!code) {
      return res.status(400).json(toError('code is required'));
    }

    const executionId = randomUUID().replace(/-/g, '').slice(0, 12);
    const workDir = join(tmpdir(), `sandbox-${executionId}`);
    mkdirSync(workDir, { recursive: true });

    const codePath = join(workDir, 'code.mjs');
    const runnerPath = join(workDir, 'runner.mjs');
    const pkgPath = join(workDir, 'package.json');
    const nmLink = join(workDir, 'node_modules');

    writeFileSync(codePath, code, 'utf8');
    writeFileSync(pkgPath, JSON.stringify({ name: 'sandbox', private: true, type: 'module' }), 'utf8');
    symlinkSync(PREBUILT_NODE_MODULES_DIR, nmLink, 'dir');
    writeFileSync(runnerPath, `
      import userFn from './code.mjs';
      const value = await userFn();
      process.stdout.write(JSON.stringify(value));
    `, 'utf8');

    const result = await new Promise((resolve, reject) => {
      const child = spawn('node', [runnerPath], { cwd: workDir, stdio: ['ignore', 'pipe', 'pipe'] });
      const stdout = [];
      const stderr = [];

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (c) => stdout.push(Buffer.from(c)));
      child.stderr.on('data', (c) => stderr.push(Buffer.from(c)));
      child.on('error', reject);
      child.on('exit', (exitCode) => {
        clearTimeout(timer);
        if (exitCode !== 0) {
          reject(new Error(`Exit code ${exitCode}: ${Buffer.concat(stderr).toString('utf8')}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(stdout).toString('utf8')));
        } catch (e) {
          reject(new Error(`Failed to parse output: ${e.message}`));
        }
      });
    });

    // Cleanup
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}

    const normalized = (typeof result === 'object' && result !== null && (result.status === 'ok' || result.status === 'error'))
      ? result
      : { status: 'ok', data: result };

    const payloadBytes = Buffer.byteLength(JSON.stringify(normalized), 'utf8');
    if (payloadBytes > MAX_RESULT_BYTES) {
      return res.json(toError(`Result exceeded max size (${MAX_RESULT_BYTES} bytes)`));
    }

    res.json(normalized);
  } catch (error) {
    res.json(toError(error.message || 'execution failed'));
  }
});

app.listen(port, () => {
  console.log(`sandbox-api (docker) listening on :${port}`);
});
