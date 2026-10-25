import type { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';
import { Effect } from 'effect';
import { z } from 'zod';

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export interface Tool {
  declaration: ChatCompletionFunctionTool;
  execute: (rawArguments: string, signal?: AbortSignal) => Effect.Effect<ToolResult>;
}

export function defineTool<Schema extends z.ZodType>(options: {
  name: string;
  description: string;
  inputSchema: Schema;
  run: (input: z.output<Schema>, signal: AbortSignal) => Promise<unknown>;
}): Tool {
  return {
    declaration: {
      type: 'function',
      function: {
        name: options.name,
        description: options.description,
        parameters: z.toJSONSchema(options.inputSchema),
      },
    },

    execute(rawArguments, signal) {
      // 创建任务本身不执行，Loop 中 runPromise 时才解析参数并调用 run。
      return Effect.tryPromise({
        try: async (effectSignal): Promise<ToolResult> => {
          const combined = AbortSignal.any([effectSignal, ...(signal ? [signal] : [])]);
          combined.throwIfAborted();

          let value: unknown;
          try {
            value = JSON.parse(rawArguments);
          } catch {
            return { ok: false, error: '参数必须是完整 JSON 对象' };
          }

          const parsed = options.inputSchema.safeParse(value);
          if (!parsed.success) return { ok: false, error: parsed.error.message };

          const data = await options.run(parsed.data, combined);
          return { ok: true, data };
        },
        catch: (cause) => new Error(cause instanceof Error ? cause.message : '工具执行失败'),
      }).pipe(
        Effect.catch((error) => Effect.succeed({ ok: false as const, error: error.message })),
      );
    },
  };
}
