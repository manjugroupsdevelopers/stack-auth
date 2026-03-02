import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_ALLOWED_MODULES = 'react@19.1.1,react-dom@19.1.1,@react-email/components@1.0.6,arktype@2.1.20';

function parseAllowedModules() {
  const raw = process.env.STACK_SANDBOX_ALLOWED_MODULES || DEFAULT_ALLOWED_MODULES;
  const entries = raw.split(',').map(item => item.trim()).filter(Boolean);
  const map = new Map();
  for (const entry of entries) {
    const separatorIndex = entry.lastIndexOf('@');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid allowlist entry: ${entry}`);
    }
    map.set(entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1));
  }
  return map;
}

function normalizeResult(result) {
  if (typeof result === 'object' && result !== null && (result.status === 'ok' || result.status === 'error')) {
    return result;
  }
  return { status: 'ok', data: result };
}

async function postResult(callbackUrl, callbackToken, body) {
  await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${callbackToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function runCommand(command, args, cwd, timeoutMs) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    const timeoutHandle = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Command timed out: ${command} ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderr.push(Buffer.from(chunk));
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      clearTimeout(timeoutHandle);
      if (code !== 0) {
        const stdoutText = Buffer.concat(stdout).toString('utf8');
        const stderrText = Buffer.concat(stderr).toString('utf8');
        const details = [stderrText, stdoutText]
          .filter(Boolean)
          .join('\n')
          .trim()
          .slice(-4000);
        reject(new Error(`${command} exited with code ${code}${details ? `: ${details}` : ''}`));
        return;
      }
      resolve();
    });
  });
}

async function main() {
  const payloadB64 = process.env.RUNNER_EXECUTION_PAYLOAD_B64;
  const callbackUrl = process.env.RUNNER_CALLBACK_URL;
  const callbackToken = process.env.RUNNER_CALLBACK_TOKEN;

  if (!payloadB64 || !callbackUrl || !callbackToken) {
    throw new Error('RUNNER_EXECUTION_PAYLOAD_B64, RUNNER_CALLBACK_URL, and RUNNER_CALLBACK_TOKEN are required');
  }

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
  const { executionId, requestId, timeoutMs, code, nodeModules } = payload;

  const allowedModules = parseAllowedModules();
  const modules = Object.entries(nodeModules || {});
  for (const [name, version] of modules) {
    const allowedVersion = allowedModules.get(name);
    if (!allowedVersion) {
      throw new Error(`Dependency ${name} is not allowlisted`);
    }
    if (allowedVersion !== version) {
      throw new Error(`Dependency ${name}@${version} is not allowlisted; expected ${allowedVersion}`);
    }
  }

  const workspaceDir = join(tmpdir(), `sandbox-runner-${executionId}`);
  mkdirSync(workspaceDir, { recursive: true });

  const codePath = join(workspaceDir, 'code.mjs');
  const runnerPath = join(workspaceDir, 'runner.mjs');
  const packagePath = join(workspaceDir, 'package.json');

  writeFileSync(codePath, code, 'utf8');
  writeFileSync(packagePath, JSON.stringify({ name: 'sandbox-runner', private: true, type: 'module' }), 'utf8');
  writeFileSync(runnerPath, `
    import userFn from './code.mjs';
    const value = await userFn();
    process.stdout.write(JSON.stringify(value));
  `, 'utf8');

  if (modules.length > 0) {
    const packageArgs = modules.map(([name, version]) => `${name}@${version}`);
    await runCommand('npm', ['install', '--no-save', ...packageArgs], workspaceDir, timeoutMs);
  }

  const executionOutput = await new Promise((resolve, reject) => {
    const child = spawn('node', [runnerPath], { cwd: workspaceDir, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];

    const timeoutHandle = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Runner timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderr.push(Buffer.from(chunk));
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      clearTimeout(timeoutHandle);
      if (code !== 0) {
        reject(new Error(`Runner process failed with code ${code}: ${Buffer.concat(stderr).toString('utf8')}`));
        return;
      }

      try {
        const parsed = JSON.parse(Buffer.concat(stdout).toString('utf8'));
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Failed to parse runner output: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  });

  const normalized = normalizeResult(executionOutput);
  await postResult(callbackUrl, callbackToken, {
    executionId,
    requestId,
    result: normalized,
  });
}

main().catch(async (error) => {
  const payloadB64 = process.env.RUNNER_EXECUTION_PAYLOAD_B64;
  const callbackUrl = process.env.RUNNER_CALLBACK_URL;
  const callbackToken = process.env.RUNNER_CALLBACK_TOKEN;

  if (payloadB64 && callbackUrl && callbackToken) {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
    await postResult(callbackUrl, callbackToken, {
      executionId: payload.executionId,
      requestId: payload.requestId,
      result: {
        status: 'error',
        error: {
          message: error instanceof Error ? error.message : 'sandbox runner failed',
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
    });
  }
  process.exit(1);
});
