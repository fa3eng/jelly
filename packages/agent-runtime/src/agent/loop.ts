import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { AgentOutputEvent } from '@jelly/domain';
import type { ContextBuilder } from '../context/context';
import type { ToolRegistry } from '../tools/registry';
import type { ModelTurn, ModelTurnFunction } from './model-turn';
import { contextToMessage, type AgentHooks, type RuntimeContext } from './hooks';

export type AgentMessage = ChatCompletionMessageParam;

/** Loop 的内部输出；message 供 Session 保存，其他项供界面显示。 */
export type AgentStreamItem =
  | AgentOutputEvent
  | { type: 'message'; message: AgentMessage }
  | { type: 'context-added'; context: RuntimeContext };

export interface AgentRunOptions {
  /** 控制模型请求与工具执行的取消，不承载保存消息的回调。 */
  signal?: AbortSignal;
  /** Restored harness contexts; not reconstructed from user-authored text. */
  contexts?: readonly RuntimeContext[];
}

export interface AgentRunResult {
  messages: AgentMessage[];
  text: string;
}

/**
 * 组装执行模型与工具循环的 Agent；由 Service 启动时调用。
 * @param dependencies - 模型请求函数、工具注册表和 Context Builder。
 * @returns 提供 run 异步生成器的 Agent，不依赖 Session 或文件存储。
 */
export function createAgent(dependencies: {
  modelTurn: ModelTurnFunction;
  tools: ToolRegistry;
  context: ContextBuilder;
  hooks?: AgentHooks;
}) {
  /**
   * 执行一次用户触发的模型与工具循环；由 Session.run 创建并消费。
   * @param history - 已恢复历史与本轮输入；复制后用于本次执行。
   * @param options - 可选的执行控制项，signal 用于取消。
   * @yields 展示事件，以及已组装的完整 assistant/tool 消息副本。
   * @returns 本次执行的消息与累计正文；Session 不依赖这个最终返回值保存消息。
   * @throws 模型请求、工具执行或取消异常，由外层 Session 记录运行状态。
   */
  async function* run(
    history: AgentMessage[],
    options?: AgentRunOptions,
  ): AsyncGenerator<AgentStreamItem, AgentRunResult> {
    const messages = structuredClone(history);
    const contexts = structuredClone([...(options?.contexts ?? [])]);
    let text = '';

    while (true) {
      options?.signal?.throwIfAborted();
      for (const hook of dependencies.hooks?.beforeModel ?? []) {
        const effects = await hook({
          messages: structuredClone(messages),
          contexts: structuredClone(contexts),
          signal: options?.signal,
        });
        options?.signal?.throwIfAborted();
        for (const effect of effects) {
          const context = structuredClone(effect.context);
          // The consumer persists this item before resuming the generator.
          yield { type: 'context-added', context: structuredClone(context) };
          options?.signal?.throwIfAborted();
          contexts.push(context);
          messages.push(contextToMessage(context));
        }
      }
      const context = dependencies.context.build(messages);
      let turn: ModelTurn | undefined;
      for await (const event of dependencies.modelTurn(context.messages, context.tools, options)) {
        if (event.type === 'text-delta') {
          text += event.delta;
          yield event;
        } else turn = event.turn;
      }
      if (!turn) {
        options?.signal?.throwIfAborted();
        throw new Error('没有收到完整的模型响应');
      }

      messages.push(turn.message);
      yield { type: 'message', message: structuredClone(turn.message) };
      options?.signal?.throwIfAborted();
      if (turn.finishReason === 'stop') return { messages, text };

      for (const call of turn.message.tool_calls ?? []) {
        options?.signal?.throwIfAborted();
        yield { type: 'tool-started', callId: call.id, name: call.function.name };
        options?.signal?.throwIfAborted();
        const result = await dependencies.tools.execute(
          call.function.name,
          call.function.arguments,
          options?.signal,
        );
        const message: AgentMessage = {
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        };
        messages.push(message);
        yield { type: 'message', message: structuredClone(message) };
        options?.signal?.throwIfAborted();
        yield {
          type: 'tool-finished',
          callId: call.id,
          name: call.function.name,
          ok: result.ok,
        };
      }
    }
  }

  return { run };
}
