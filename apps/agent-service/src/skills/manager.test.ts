import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSkillManager } from './manager';

const directories: string[] = [];
const managers: Awaited<ReturnType<typeof createSkillManager>>[] = [];
async function root() {
  const path = await mkdtemp(join(tmpdir(), 'jelly-live-skills-'));
  directories.push(path);
  return path;
}
async function write(root: string, body = 'first') {
  await mkdir(join(root, 'organize-notes'), { recursive: true });
  await writeFile(
    join(root, 'organize-notes', 'SKILL.md'),
    `---\nname: organize-notes\ndescription: 整理笔记\n---\n${body}`,
  );
}
afterEach(async () => {
  for (const manager of managers.splice(0)) manager.close();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('live Skill Manager', () => {
  it('reattaches watchers when a skill directory is replaced at the same path', async () => {
    const directory = await root();
    await write(directory, 'original');
    const manager = await createSkillManager(directory);
    managers.push(manager);
    const original = manager.getCatalog().skills[0]!.revision;
    await rename(join(directory, 'organize-notes'), join(directory, 'old-directory'));
    await write(directory, 'replacement');
    await expect
      .poll(
        () =>
          manager.getCatalog().skills.find((skill) => skill.name === 'organize-notes')?.revision,
      )
      .not.toBe(original);
    await expect
      .poll(
        () =>
          manager.getCatalog().skills.find((skill) => skill.name === 'organize-notes')?.revision,
      )
      .not.toBeUndefined();
    const replacement = manager
      .getCatalog()
      .skills.find((skill) => skill.name === 'organize-notes')!.revision;
    await write(directory, 'edited after replacement');
    await expect
      .poll(
        () =>
          manager.getCatalog().skills.find((skill) => skill.name === 'organize-notes')?.revision,
      )
      .not.toBe(replacement);
  });
  it('discovers later-created roots and reloads updated bodies without retaining instructions in catalog', async () => {
    const directory = join(await root(), 'missing');
    const manager = await createSkillManager(directory);
    managers.push(manager);
    expect((await manager.refresh()).skills).toEqual([]);
    await write(directory);
    const first = await manager.load('organize-notes');
    expect(first.instructions).toBe('first');
    expect((await manager.refresh()).skills[0]).not.toHaveProperty('instructions');
    await write(directory, 'second');
    const second = await manager.load('organize-notes');
    expect(second.instructions).toBe('second');
    expect(second.revision).not.toBe(first.revision);
    await rm(join(directory, 'organize-notes'), { recursive: true });
    await expect(manager.load('organize-notes')).rejects.toThrow();
  });

  it('publishes watcher updates and handles atomic replacement, invalidation and recovery', async () => {
    const directory = await root();
    await write(directory);
    const manager = await createSkillManager(directory);
    managers.push(manager);
    const initial = manager.getCatalog().skills[0]!.revision;
    const temporary = join(directory, 'organize-notes', 'temporary');
    await writeFile(temporary, 'broken');
    await rename(temporary, join(directory, 'organize-notes', 'SKILL.md'));
    await expect.poll(() => manager.getCatalog().skills.length).toBe(0);
    expect(manager.getCatalog().diagnostics.length).toBeGreaterThan(0);
    await write(directory, 'recovered');
    await expect.poll(() => manager.getCatalog().skills[0]?.revision).not.toBeUndefined();
    expect(manager.getCatalog().skills[0]!.revision).not.toBe(initial);
    expect((await manager.load('organize-notes')).instructions).toBe('recovered');
    manager.close();
    await expect(manager.refresh()).rejects.toThrow(/closed|关闭/);
  });
});
