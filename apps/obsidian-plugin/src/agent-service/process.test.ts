import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const processModulePromise = import('./process').catch(() => null);
const tsxLoader = createRequire(import.meta.url).resolve('tsx');

describe('Agent Service process manager', () => {
  beforeEach(() => vi.stubGlobal('window', globalThis));
  afterEach(() => vi.unstubAllGlobals());
  it.each([false, true])('starts and stops the real Node service (watch=%s)', async (watch) => {
    const processModule = await processModulePromise;
    expect(processModule).not.toBeNull();
    if (!processModule) return;

    const serviceEntry = fileURLToPath(
      new URL('../../../agent-service/src/index.ts', import.meta.url),
    );
    const directory = await mkdtemp(join(tmpdir(), 'jelly-service-start-'));
    const service = await processModule.startAgentService({
      executable: process.execPath,
      args: ['--import', tsxLoader, ...(watch ? ['--watch'] : []), serviceEntry],
      allowedOrigin: 'app://obsidian.md',
      cwd: directory,
      environment: {
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: 'test-model',
        JELLY_DOCS_DIRECTORY: directory,
        JELLY_SESSION_DIRECTORY: join(directory, '.jelly/sessions'),
      },
    });

    try {
      const response = await fetch(`${service.baseUrl}/health/ready`, {
        headers: {
          Authorization: `Bearer ${service.authorizationToken}`,
          Origin: 'app://obsidian.md',
        },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ready' });
    } finally {
      await service.stop();
      await rm(directory, { recursive: true, force: true });
    }
    await expect(fetch(`${service.baseUrl}/health`)).rejects.toThrow();
  });

  it('uses a host launcher with the same authenticated HTTP lifecycle', async () => {
    const { startAgentService } = await import('./process');
    const fixture = fileURLToPath(new URL('./test-fixtures/health-server.mjs', import.meta.url));
    const service = await startAgentService({
      launch: (env) => spawn(process.execPath, [fixture], { env, stdio: 'ignore' }),
      allowedOrigin: 'app://obsidian.md',
    });
    try {
      const response = await fetch(`${service.baseUrl}/health/ready`, {
        headers: {
          Authorization: `Bearer ${service.authorizationToken}`,
          Origin: 'app://obsidian.md',
        },
      });
      expect(response.status).toBe(200);
    } finally {
      await service.stop();
    }
    await expect(fetch(`${service.baseUrl}/health`)).rejects.toThrow();
  });

  it('loads the optional working-directory env file through the real Node entry', async () => {
    const processModule = await processModulePromise;
    expect(processModule).not.toBeNull();
    if (!processModule) return;

    const directory = await mkdtemp(join(tmpdir(), 'jelly-service-env-'));
    const serviceEntry = fileURLToPath(
      new URL('../../../agent-service/src/index.ts', import.meta.url),
    );
    await writeFile(
      join(directory, '.env'),
      `JELLY_CWD_TEST=loaded-from-env\nJELLY_SERVER_TOKEN=ignored-file-token\nJELLY_SERVER_PORT=1\nOPENAI_API_KEY=test-key\nOPENAI_MODEL=test-model\nJELLY_DOCS_DIRECTORY=${directory}\nJELLY_SESSION_DIRECTORY=${join(directory, '.jelly/sessions')}\n`,
    );
    try {
      const service = await processModule.startAgentService({
        executable: process.execPath,
        args: [
          '--import',
          tsxLoader,
          '--input-type=module',
          '--eval',
          `await import(${JSON.stringify(pathToFileURL(serviceEntry).href)}); if (process.env.JELLY_CWD_TEST !== "loaded-from-env") process.exit(9);`,
        ],
        cwd: directory,
        allowedOrigin: 'app://obsidian.md',
      });
      try {
        const response = await fetch(`${service.baseUrl}/health/ready`, {
          headers: {
            Authorization: `Bearer ${service.authorizationToken}`,
            Origin: 'app://obsidian.md',
          },
        });
        expect(response.status).toBe(200);
      } finally {
        await service.stop();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('starts a child service, waits until ready, and stops it idempotently', async () => {
    const processModule = await processModulePromise;
    expect(processModule).not.toBeNull();
    if (!processModule) return;

    const fixturePath = fileURLToPath(
      new URL('./test-fixtures/health-server.mjs', import.meta.url),
    );
    const service = await processModule.startAgentService({
      executable: process.execPath,
      args: [fixturePath],
      allowedOrigin: 'app://obsidian.md',
    });

    expect(service.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const readyResponse = await fetch(`${service.baseUrl}/health/ready`, {
      headers: {
        Authorization: `Bearer ${service.authorizationToken}`,
        Origin: 'app://obsidian.md',
      },
    });
    expect(readyResponse.status).toBe(200);

    await service.stop();
    await service.stop();
    await expect(fetch(`${service.baseUrl}/health`)).rejects.toThrow();
  });

  it('rejects a child process that exits before becoming ready', async () => {
    const processModule = await processModulePromise;
    expect(processModule).not.toBeNull();
    if (!processModule) return;

    await expect(
      processModule.startAgentService({
        executable: process.execPath,
        args: ['-e', 'process.exit(9)'],
        allowedOrigin: 'app://obsidian.md',
      }),
    ).rejects.toThrow('Agent Service exited before becoming ready');
  });

  it('retries with a new port when a child exits before readiness', async () => {
    const processModule = await processModulePromise;
    expect(processModule).not.toBeNull();
    if (!processModule) return;

    const markerDirectory = await mkdtemp(join(tmpdir(), 'jelly-service-retry-'));
    const markerPath = join(markerDirectory, 'first-start');
    const fixturePath = fileURLToPath(
      new URL('./test-fixtures/retry-once-server.mjs', import.meta.url),
    );

    try {
      const service = await processModule.startAgentService({
        executable: process.execPath,
        args: [fixturePath],
        allowedOrigin: 'app://obsidian.md',
        environment: { JELLY_TEST_MARKER: markerPath },
      });

      expect(service.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      await service.stop();
    } finally {
      await rm(markerDirectory, { recursive: true, force: true });
    }
  });
});
