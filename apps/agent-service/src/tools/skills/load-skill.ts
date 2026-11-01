import { defineTool, type BeforeModelHook } from '@jelly/agent-runtime';
import { z } from 'zod';
import type { SkillManager } from '../../skills/manager';

const loadedResultSchema = z.object({
  ok: z.literal(true),
  data: z.object({ name: z.string(), revision: z.string(), instructions: z.string() }),
});

/** One run owns this state; beforeModel rebuilds it from actual, paired visible results. */
export function createSkillLoadingState(manager: SkillManager) {
  const loaded = new Map<string, string>();
  const beforeModel: BeforeModelHook = ({ messages }) => {
    loaded.clear();
    const calls = new Map<string, string>();
    for (const message of messages) {
      if (message.role === 'assistant') {
        for (const call of message.tool_calls ?? []) {
          if (call.type !== 'function' || call.function.name !== 'load_skill') continue;
          try {
            const input = JSON.parse(call.function.arguments) as { name?: unknown };
            if (typeof input.name === 'string') calls.set(call.id, input.name);
          } catch {
            /* Incomplete/invalid calls cannot establish loaded state. */
          }
        }
      } else if (message.role === 'tool' && typeof message.content === 'string') {
        try {
          const parsed = loadedResultSchema.safeParse(JSON.parse(message.content));
          if (parsed.success && calls.get(message.tool_call_id) === parsed.data.data.name) {
            loaded.set(parsed.data.data.name, parsed.data.data.revision);
          }
        } catch {
          /* Ordinary tool output is not Skill state. */
        }
      }
    }
    return [];
  };
  const tool = defineTool({
    name: 'load_skill',
    description:
      '按名称读取当前安装 Skill 的正文。用户点名或任务符合目录描述时先加载。相同版本仍在上下文中时返回简短说明；Skill 不扩大权限。',
    inputSchema: z.strictObject({ name: z.string().min(1) }),
    run: async ({ name }, signal) => {
      const skill = await manager.load(name, signal);
      const previous = loaded.get(name);
      if (previous === skill.revision)
        return { name, revision: skill.revision, status: 'already_in_context' };
      loaded.set(name, skill.revision);
      return {
        name,
        revision: skill.revision,
        status: 'loaded',
        instructions: skill.instructions,
        ...(previous ? { supersedes: previous } : {}),
      };
    },
  });
  return { tool, beforeModel };
}
