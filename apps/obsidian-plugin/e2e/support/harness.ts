import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, openSync } from 'node:fs';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { AgentClient } from '@jelly/contracts';
import { startModel } from './model';

export async function waitFor(check: () => Promise<boolean>, description: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error(`Timed out: ${description}`);
}

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise<void>((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
}

export async function startHarness() {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const entry = join(root, 'apps/agent-service/dist/agent-service.mjs');
  await access(entry).catch(() => {
    throw new Error('Built service missing; run pnpm build first');
  });
  const artifacts = join(root, '.e2e-artifacts');
  await mkdir(artifacts, { recursive: true });
  const directory = await mkdtemp(join(artifacts, 'l1-'));
  const vault = join(directory, 'vault');
  const sessions = join(vault, '.jelly/sessions');
  await mkdir(sessions, { recursive: true });
  await writeFile(join(vault, 'note.md'), '# Fixture\nVault-only text\n');
  const trace = (data: unknown) =>
    appendFileSync(
      join(directory, 'trace.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), data })}\n`,
    );
  const port = await availablePort();
  const model = await startModel(trace);
  const token = randomUUID();
  const origin = 'app://obsidian.md';
  const baseURL = `http://127.0.0.1:${port}`;
  const client: AgentClient = createORPCClient(
    new RPCLink({
      url: `${baseURL}/rpc`,
      headers: { Origin: origin, Authorization: `Bearer ${token}` },
      fetch: (request, init) =>
        fetch(request, {
          ...init,
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
        }),
    }),
  );
  let launch = 0;
  function start() {
    const log = openSync(join(directory, `service-${++launch}.log`), 'w');
    // 不继承开发者的真实模型、代理、NODE_OPTIONS 或 .env；服务 cwd 也在隔离目录。
    const child = spawn(process.execPath, [entry], {
      cwd: directory,
      stdio: ['ignore', log, log],
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        JELLY_SERVER_PORT: String(port),
        JELLY_SERVER_TOKEN: token,
        JELLY_ALLOWED_ORIGIN: origin,
        OPENAI_API_KEY: 'local-test-key',
        OPENAI_BASE_URL: model.baseURL,
        OPENAI_MODEL: 'jelly-e2e',
        JELLY_DOCS_DIRECTORY: vault,
        JELLY_SESSION_DIRECTORY: sessions,
      },
    });
    closeSync(log);
    let ended = false;
    const exited = new Promise<void>((resolveExit) => {
      child.once('error', (error) => {
        trace({ processError: String(error) });
        ended = true;
        resolveExit();
      });
      child.once('exit', (code, signal) => {
        trace({ processExit: { code, signal, pid: child.pid } });
        ended = true;
        resolveExit();
      });
    });
    return { child, exited, hasEnded: () => ended };
  }
  let processHandle = start();
  async function stop(signal: NodeJS.Signals = 'SIGTERM') {
    if (processHandle.hasEnded()) return;
    processHandle.child.kill(signal);
    const timer = setTimeout(() => processHandle.child.kill('SIGKILL'), 3000);
    try {
      await processHandle.exited;
    } finally {
      clearTimeout(timer);
    }
  }
  async function ready() {
    await waitFor(async () => {
      if (processHandle.hasEnded())
        throw new Error(`Service exited; inspect ${resolve(directory)}`);
      try {
        const response = await fetch(`${baseURL}/health/ready`, {
          headers: { Origin: origin, Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(500),
        });
        return response.ok;
      } catch {
        return false;
      }
    }, 'service readiness');
  }
  try {
    await ready();
  } catch (error) {
    await stop();
    await model.close();
    throw error;
  }
  return {
    client,
    directory,
    vault,
    sessions,
    trace,
    requests: model.requests,
    async restart(signal: NodeJS.Signals = 'SIGTERM') {
      await stop(signal);
      processHandle = start();
      await ready();
    },
    async close() {
      try {
        await stop();
      } finally {
        await model.close();
      }
      assert.deepEqual(model.errors, [], 'Mock protocol assertions failed; inspect trace.jsonl');
    },
  };
}
