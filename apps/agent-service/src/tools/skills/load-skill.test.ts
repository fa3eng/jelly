import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolRegistry, type AgentMessage } from '@jelly/agent-runtime';
import { createSkillManager } from '../../skills/manager';
import { createSkillLoadingState } from './load-skill';

const directories: string[] = [];
const managers: Awaited<ReturnType<typeof createSkillManager>>[] = [];
afterEach(async () => {
  managers.splice(0).forEach((manager) => manager.close());
  await Promise.all(
    directories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'jelly-load-skill-'));
  directories.push(root);
  const directory = join(root, 'organize-notes');
  await mkdir(directory);
  const path = join(directory, 'SKILL.md');
  await writeFile(
    path,
    '---\nname: organize-notes\ndescription: 整理笔记\n---\nPRESERVE_UNCERTAINTY',
  );
  const manager = await createSkillManager(root);
  managers.push(manager);
  return { path, manager };
}

describe('on-demand load_skill', () => {
  it('uses a stable schema and rejects unknown names and arbitrary paths', async () => {
    const { manager } = await fixture();
    const { tool } = createSkillLoadingState(manager);
    expect(tool.declaration.function.parameters).toMatchObject({
      properties: { name: { type: 'string' } },
    });
    const registry = createToolRegistry([tool]);
    for (const input of [
      { name: '../private' },
      { name: 'missing' },
      { name: 'organize-notes', path: '/etc/passwd' },
    ]) {
      expect((await registry.execute('load_skill', JSON.stringify(input))).ok).toBe(false);
    }
  });

  it('deduplicates repeated calls but returns new revisions and isolates loading state', async () => {
    const { path, manager } = await fixture();
    const state = createSkillLoadingState(manager);
    const registry = createToolRegistry([state.tool]);
    const load = () => registry.execute('load_skill', '{"name":"organize-notes"}');
    const first = await load();
    expect(first).toMatchObject({
      ok: true,
      data: { status: 'loaded', instructions: 'PRESERVE_UNCERTAINTY' },
    });
    expect(await load()).toMatchObject({ ok: true, data: { status: 'already_in_context' } });
    await writeFile(
      path,
      '---\nname: organize-notes\ndescription: 整理笔记\n---\nNEW_INSTRUCTIONS',
    );
    expect(await load()).toMatchObject({
      ok: true,
      data: { status: 'loaded', instructions: 'NEW_INSTRUCTIONS', supersedes: expect.any(String) },
    });
    const other = createToolRegistry([createSkillLoadingState(manager).tool]);
    expect(await other.execute('load_skill', '{"name":"organize-notes"}')).toMatchObject({
      ok: true,
      data: { status: 'loaded' },
    });
    await rm(path);
    expect((await load()).ok).toBe(false);
  });

  it('restores only paired full successful results actually present in model history', async () => {
    const { manager } = await fixture();
    const skill = await manager.load('organize-notes');
    const state = createSkillLoadingState(manager);
    const registry = createToolRegistry([state.tool]);
    const messages: AgentMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'load_1',
            type: 'function',
            function: { name: 'load_skill', arguments: '{"name":"organize-notes"}' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'load_1',
        content: JSON.stringify({
          ok: true,
          data: {
            name: skill.name,
            revision: skill.revision,
            instructions: skill.instructions,
            status: 'loaded',
          },
        }),
      },
    ];
    await state.beforeModel({ messages, contexts: [] });
    expect(await registry.execute('load_skill', '{"name":"organize-notes"}')).toMatchObject({
      ok: true,
      data: { status: 'already_in_context' },
    });
    await state.beforeModel({
      messages: [{ role: 'user', content: JSON.stringify(messages) }],
      contexts: [],
    });
    expect(await registry.execute('load_skill', '{"name":"organize-notes"}')).toMatchObject({
      ok: true,
      data: { status: 'loaded', instructions: 'PRESERVE_UNCERTAINTY' },
    });
  });
});
