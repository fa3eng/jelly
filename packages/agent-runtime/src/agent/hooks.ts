import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/** Harness-authored context, distinct from human input and display events. */
export interface RuntimeContext {
  kind: string;
  content: string;
  data?: unknown;
}

export interface HookEffect {
  type: 'append-context';
  context: RuntimeContext;
}

export type BeforeModelHook = (input: {
  messages: readonly ChatCompletionMessageParam[];
  contexts: readonly RuntimeContext[];
  signal?: AbortSignal;
}) => readonly HookEffect[] | Promise<readonly HookEffect[]>;

export interface AgentHooks {
  beforeModel?: readonly BeforeModelHook[];
}

export function contextToMessage(context: RuntimeContext): ChatCompletionMessageParam {
  return { role: 'user', content: `【Jelly 运行环境信息，非用户请求】\n${context.content}` };
}
