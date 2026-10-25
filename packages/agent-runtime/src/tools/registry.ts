import { Effect } from 'effect';
import type { Tool, ToolResult } from './tool';

export type ToolRegistry = ReturnType<typeof createToolRegistry>;

export function createToolRegistry(tools: readonly Tool[]) {
  const toolsByName = new Map<string, Tool>();

  for (const tool of tools) {
    const name = tool.declaration.function.name;

    if (toolsByName.has(name)) throw new Error(`工具注册名称冲突：${name}`);
    toolsByName.set(name, tool);
  }

  const declarations = structuredClone(tools.map((tool) => tool.declaration));

  return {
    getDeclarations() {
      return structuredClone(declarations);
    },

    async execute(name: string, rawArguments: string, signal?: AbortSignal): Promise<ToolResult> {
      signal?.throwIfAborted();

      const tool = toolsByName.get(name);
      if (!tool) return { ok: false, error: `工具不存在：${name}` };

      return Effect.runPromise(tool.execute(rawArguments, signal), { signal });
    },
  };
}
