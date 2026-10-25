import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { prepareServiceBundle } from './bundle';

const run = promisify(execFile);

describe('embedded Agent Service bundle', () => {
  it('prepares an executable ESM service from a fresh plugin install', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jelly-bundle-'));
    try {
      const output = join(directory, 'started');
      const source = `import { writeFile } from 'node:fs/promises'; await writeFile(${JSON.stringify(output)}, 'ready');`;
      const entry = await prepareServiceBundle(directory, source);
      await run(process.execPath, [entry], { cwd: directory });
      expect(await readFile(output, 'utf8')).toBe('ready');
      expect(await prepareServiceBundle(directory, source)).toBe(entry);
      await writeFile(join(dirname(entry), 'agent-service.mjs'), 'corrupt');
      await prepareServiceBundle(directory, source);
      await run(process.execPath, [entry], { cwd: directory });
      expect(await readFile(join(dirname(entry), 'agent-service.mjs'), 'utf8')).toBe(source);
      expect(await prepareServiceBundle(directory, `${source}\n// updated`)).not.toBe(entry);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(['navigation', 'destroyed', 'crashed'])(
    'stops the actual child when its owning window is %s',
    async (event) => {
      const directory = await mkdtemp(join(tmpdir(), 'jelly-host-owner-'));
      let actual: ChildProcess | undefined;
      try {
        const entry = await prepareServiceBundle(directory, 'setInterval(() => {}, 1000);');
        const owner = new EventEmitter();
        const module = { exports: null as unknown };
        runInNewContext(await readFile(join(dirname(entry), 'host-launcher.cjs'), 'utf8'), {
          module,
          process,
          setTimeout,
          clearTimeout,
          require: (id: string) => {
            if (id !== 'electron') throw new Error('unexpected dependency');
            return {
              webContents: { fromId: () => owner },
              utilityProcess: {
                fork: () => {
                  actual = spawn(process.execPath, [entry], { stdio: 'ignore' });
                  return actual;
                },
              },
            };
          },
        });
        const fork = module.exports as (
          ownerId: number,
          entry: string,
          args: string[],
          options: object,
        ) => ChildProcess;
        const child = fork(1, entry, [], {});
        const exited = once(child, 'exit');
        owner.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false });
        owner.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
        expect(child.killed).toBe(false);
        if (event === 'navigation')
          owner.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
        else owner.emit(event === 'crashed' ? 'render-process-gone' : 'destroyed');
        await exited;
        expect(owner.listenerCount('did-start-navigation')).toBe(0);
        expect(owner.listenerCount('destroyed')).toBe(0);
      } finally {
        if (actual && actual.exitCode === null && actual.signalCode === null)
          actual.kill('SIGKILL');
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it('exits with failure when the embedded service cannot start', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jelly-bundle-error-'));
    try {
      const entry = await prepareServiceBundle(directory, 'throw new Error("startup failed")');
      await expect(run(process.execPath, [entry])).rejects.toMatchObject({ code: 1 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
