import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RuntimeContext } from '@jelly/agent-runtime';
import { createSkillManager } from './manager';
import { createSkillCatalogHook } from './hooks';

const directories: string[] = [];
const managers: Awaited<ReturnType<typeof createSkillManager>>[] = [];
afterEach(async () => {
  managers.splice(0).forEach((manager) => manager.close());
  await Promise.all(
    directories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Skill catalog hook', () => {
  it('appends an initial catalog and only unseen add/edit/remove deltas for this session', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jelly-skill-hook-'));
    directories.push(root);
    const manager = await createSkillManager(root);
    managers.push(manager);
    const hook = createSkillCatalogHook(manager);
    const contexts: RuntimeContext[] = [];
    const input = { messages: [], contexts };
    const initial = await hook(input);
    expect(initial).toHaveLength(1);
    expect(initial[0]?.context.data).toMatchObject({
      mode: 'snapshot',
      version: 1,
      skills: [],
      removed: [],
    });
    contexts.push(initial[0]!.context);
    expect(await hook(input)).toEqual([]);
    await mkdir(join(root, 'organize-notes'));
    const path = join(root, 'organize-notes', 'SKILL.md');
    await writeFile(path, '---\nname: organize-notes\ndescription: 整理\n---\nPRIVATE_BODY');
    const added = await hook(input);
    expect(added[0]?.context.data).toMatchObject({
      mode: 'delta',
      version: 2,
      skills: [{ name: 'organize-notes' }],
      removed: [],
    });
    expect(JSON.stringify(added)).not.toContain('PRIVATE_BODY');
    expect(JSON.stringify(added)).not.toContain(root);
    contexts.push(added[0]!.context);
    await writeFile(path, '---\nname: organize-notes\ndescription: 整理\n---\nNEW_BODY');
    const updated = await hook(input);
    expect(updated[0]?.context.data).toMatchObject({
      version: 3,
      skills: [{ name: 'organize-notes' }],
    });
    contexts.push(updated[0]!.context);
    await rm(path);
    const removed = await hook(input);
    expect(removed[0]?.context.data).toMatchObject({
      version: 4,
      skills: [],
      removed: ['organize-notes'],
    });
    expect((await hook({ messages: [], contexts: [] }))[0]?.context.data).toMatchObject({
      mode: 'snapshot',
      version: 1,
    });
  });
});
