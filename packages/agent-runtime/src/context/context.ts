import type {
  ChatCompletionFunctionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

export interface ModelContext {
  messages: ChatCompletionMessageParam[];
  tools: ChatCompletionFunctionTool[];
}

export interface ContextBuilder {
  build(history: readonly ChatCompletionMessageParam[]): ModelContext;
}

export function createContextBuilder(sources: {
  getSystemPrompt: () => string;
  getTools: () => readonly ChatCompletionFunctionTool[];
}): ContextBuilder {
  return {
    build(history) {
      // 按原顺序保留完整历史。
      // 系统提示词只进入请求，不追加到原始会话中。
      return structuredClone({
        messages: [{ role: 'system' as const, content: sources.getSystemPrompt() }, ...history],
        tools: [...sources.getTools()],
      });
    },
  };
}
