import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { lstatSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSkillManager } from './manager';

// Model inode-bound fs.watch semantics even on hosts that happen to follow replacement paths.
const backend = vi.hoisted(() => ({
  registrations: new Set<{ inode: number; notify: () => void; close: () => void }>(),
}));
vi.mock('node:fs', async (original) => {
  const real = await original<typeof import('node:fs')>();
  return {
    ...real,
    watch(path: string, _options: unknown, notify: () => void) {
      const watcher = new EventEmitter();
      const registration = {
        inode: real.lstatSync(path).ino,
        notify,
        close: () => {
          backend.registrations.delete(registration);
        },
      };
      backend.registrations.add(registration);
      return Object.assign(watcher, { close: registration.close });
    },
  };
});
const directories: string[] = [];
const managers: Awaited<ReturnType<typeof createSkillManager>>[] = [];
afterEach(async () => {
  managers.splice(0).forEach((manager) => manager.close());
  backend.registrations.clear();
  await Promise.all(
    directories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function notifyDirectory(path: string) {
  const inode = lstatSync(path).ino;
  for (const registration of [...backend.registrations]) {
    if (registration.inode === inode) registration.notify();
  }
}

describe('inode-bound directory watching', () => {
  it('does not postpone a pending refresh indefinitely when filesystem events keep arriving', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jelly-watch-burst-'));
    directories.push(root);
    const child = join(root, 'organize-notes');
    await mkdir(child);
    const path = join(child, 'SKILL.md');
    await writeFile(path, '---\nname: organize-notes\ndescription: 整理\n---\nfirst');
    const manager = await createSkillManager(root);
    managers.push(manager);
    const initial = manager.getCatalog().skills[0]!.revision;
    await writeFile(path, '---\nname: organize-notes\ndescription: 整理\n---\nupdated');
    notifyDirectory(child);
    const noise = setInterval(() => notifyDirectory(root), 15);
    try {
      await expect
        .poll(() => manager.getCatalog().skills[0]?.revision, { timeout: 400 })
        .not.toBe(initial);
    } finally {
      clearInterval(noise);
    }
  });
  it('keeps discovering edits after a watched directory is replaced at the same path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jelly-inode-watch-'));
    directories.push(root);
    const child = join(root, 'organize-notes');
    const write = async (body: string) => {
      await mkdir(child, { recursive: true });
      await writeFile(
        join(child, 'SKILL.md'),
        `---\nname: organize-notes\ndescription: 整理\n---\n${body}`,
      );
    };
    await write('first');
    const manager = await createSkillManager(root);
    managers.push(manager);
    const original = manager
      .getCatalog()
      .skills.find((skill) => skill.name === 'organize-notes')!.revision;
    await rename(child, join(root, 'old-directory'));
    await write('replacement');
    notifyDirectory(root);
    await expect
      .poll(
        () =>
          manager.getCatalog().skills.find((skill) => skill.name === 'organize-notes')?.revision,
      )
      .not.toBe(original);
    const current = manager
      .getCatalog()
      .skills.find((skill) => skill.name === 'organize-notes')!.revision;
    await write('next edit');
    notifyDirectory(child);
    await expect
      .poll(
        () =>
          manager.getCatalog().skills.find((skill) => skill.name === 'organize-notes')?.revision,
      )
      .not.toBe(current);
    manager.close();
    expect(backend.registrations.size).toBe(0);
  });
});
