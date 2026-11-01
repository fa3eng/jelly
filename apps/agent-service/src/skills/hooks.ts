import type { BeforeModelHook } from '@jelly/agent-runtime';
import { z } from 'zod';
import type { SkillManager } from './manager';

const summarySchema = z.object({ name: z.string(), description: z.string(), revision: z.string() });
const updateSchema = z.object({
  mode: z.enum(['snapshot', 'delta']),
  version: z.number().int().positive(),
  skills: z.array(summarySchema),
  removed: z.array(z.string()),
});

/** Compare live metadata with this session's persisted, harness-authored catalog events. */
export function createSkillCatalogHook(manager: SkillManager): BeforeModelHook {
  return async ({ contexts, signal }) => {
    signal?.throwIfAborted();
    const previous = new Map<string, z.infer<typeof summarySchema>>();
    let version = 0;
    for (const context of contexts) {
      if (context.kind !== 'skill-catalog') continue;
      const parsed = updateSchema.safeParse(context.data);
      if (!parsed.success) throw new Error('Skill 目录上下文记录无效');
      const update = parsed.data;
      if (update.mode === 'snapshot') previous.clear();
      for (const name of update.removed) previous.delete(name);
      for (const skill of update.skills) previous.set(skill.name, skill);
      version = update.version;
    }
    const catalog = await manager.refresh();
    signal?.throwIfAborted();
    const current = catalog.skills.map(({ name, description, revision }) => ({
      name,
      description,
      revision,
    }));
    const names = new Set(current.map((skill) => skill.name));
    const removed = [...previous.keys()].filter((name) => !names.has(name));
    const skills = current.filter((skill) => {
      const before = previous.get(skill.name);
      return (
        !before || before.description !== skill.description || before.revision !== skill.revision
      );
    });
    if (version && !skills.length && !removed.length) return [];
    const data = {
      mode: version ? ('delta' as const) : ('snapshot' as const),
      version: version + 1,
      skills,
      removed,
    };
    return [
      {
        type: 'append-context',
        context: {
          kind: 'skill-catalog',
          data,
          content: [
            'Skill 目录信息。仅更新运行环境，不是新的用户任务。',
            'skills 为新增或更新项，removed 为已删除或不可用项。以最新目录为准；旧版正文仅为历史，使用更新版本前先调用 load_skill。',
            JSON.stringify(data),
          ].join('\n'),
        },
      },
    ];
  };
}
