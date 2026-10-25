import { describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startAgentService } from './process';
import { assertHostNodeVersion, createUtilityLauncher } from './utility-process';

// Electron is unavailable in Vitest. Use a real Node child at the utility API boundary.
const utility = {
  fork: (entry: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) =>
    spawn(process.execPath, [entry, ...args], { ...options, stdio: 'ignore' }),
};

describe('utility process lifecycle adapter', () => {
  it.each(['18.20.8', '20.18.3', 'invalid'])(
    'rejects an unsupported embedded Node %s',
    (version) => {
      expect(() => assertHostNodeVersion(version)).toThrow('更新 Obsidian 桌面版安装程序');
    },
  );

  it.each(['20.19.0', '22.0.0', '24.18.1'])('accepts a supported embedded Node %s', (version) => {
    expect(() => assertHostNodeVersion(version)).not.toThrow();
  });

  it('serves authenticated HTTP and releases the child on stop', async () => {
    const entry = fileURLToPath(new URL('./test-fixtures/health-server.mjs', import.meta.url));
    const handle = await startAgentService({
      launch: createUtilityLauncher(utility, entry, process.cwd()),
      allowedOrigin: 'app://obsidian.md',
    });
    await handle.stop();
    await handle.stop();
    await expect(fetch(`${handle.baseUrl}/health`)).rejects.toThrow();
  });

  it('force-stops an unresponsive child when the remote spawn event was missed', async () => {
    let actual: ChildProcess | undefined;
    const lateObserverUtility = {
      fork: (entry: string, _args: string[], options: { env: NodeJS.ProcessEnv }) => {
        actual = spawn(
          process.execPath,
          [
            '--input-type=module',
            '--eval',
            `process.on('SIGTERM', () => {}); await import(${JSON.stringify(pathToFileURL(entry).href)});`,
          ],
          { env: options.env, stdio: 'ignore' },
        );
        // Main-process spawn can happen before the renderer subscribes over remote IPC.
        const observer = Object.assign(new EventEmitter(), {
          pid: actual.pid,
          kill: () => actual!.kill(),
        });
        actual.on('exit', (code) => observer.emit('exit', code));
        actual.on('error', (error) => observer.emit('error', error));
        return observer;
      },
    };
    const entry = fileURLToPath(new URL('./test-fixtures/health-server.mjs', import.meta.url));
    try {
      const handle = await startAgentService({
        launch: createUtilityLauncher(lateObserverUtility, entry, process.cwd()),
        allowedOrigin: 'app://obsidian.md',
      });
      await handle.stop();
      await expect(fetch(`${handle.baseUrl}/health`)).rejects.toThrow();
    } finally {
      if (actual && actual.exitCode === null && actual.signalCode === null) {
        const exited = once(actual, 'exit');
        actual.kill('SIGKILL');
        await exited;
      }
    }
  });

  it('propagates an early child exit without waiting for the readiness timeout', async () => {
    const failingUtility = {
      fork: () => spawn(process.execPath, ['-e', 'process.exit(9)'], { stdio: 'ignore' }),
    };
    await expect(
      startAgentService({
        launch: createUtilityLauncher(failingUtility, 'unused', process.cwd()),
        allowedOrigin: 'app://obsidian.md',
      }),
    ).rejects.toThrow('exited with code 9');
  });
});
