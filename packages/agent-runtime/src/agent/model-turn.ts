import OpenAI, { type ClientOptions } from 'openai';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionFunctionTool,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { Data, Effect, Stream } from 'effect';

export class ProviderError extends Data.TaggedError('ProviderError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export interface ModelTurn {
  message: Omit<ChatCompletionAssistantMessageParam, 'content' | 'tool_calls'> & {
    content: string;
    tool_calls?: ChatCompletionMessageFunctionToolCall[];
  };
  finishReason: 'stop' | 'tool_calls';
}
export type ModelTurnEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'model-completed'; turn: ModelTurn };

export type ModelTurnFunction = (
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionFunctionTool[],
  options?: { signal?: AbortSignal },
) => AsyncGenerator<ModelTurnEvent>;

export interface ModelOptions {
  client: ClientOptions;
  model: string;
  reasoningEffort?: ChatCompletionCreateParamsStreaming['reasoning_effort'];
}

export function createOpenAIModelTurn(settings: ModelOptions): ModelTurnFunction {
  // 启动时创建一次客户端；请求和 Stream 的资源仍然每次运行单独管理。
  const openai = new OpenAI(settings.client);

  return async function* modelTurn(messages, tools, options) {
    // 原样保留 SDK chunk，不能再只映射 delta.content。
    const chunks = Stream.unwrap(
      Effect.gen(function* () {
        const controller = new AbortController();
        yield* Effect.addFinalizer(() => Effect.sync(() => controller.abort()));

        const source = yield* Effect.tryPromise({
          try: (signal) => {
            return openai.chat.completions.create(
              {
                model: settings.model,
                ...(settings.reasoningEffort != null
                  ? { reasoning_effort: settings.reasoningEffort }
                  : {}),
                stream: true,
                messages,
                ...(tools.length > 0 ? { tools, tool_choice: 'auto' as const } : {}),
              },
              {
                signal: AbortSignal.any([
                  signal,
                  controller.signal,
                  ...(options?.signal ? [options.signal] : []),
                ]),
              },
            );
          },
          catch: (cause) => new ProviderError({ message: '模型请求启动失败', cause }),
        });

        yield* Effect.addFinalizer(() => Effect.sync(() => source.controller.abort()));

        return Stream.fromAsyncIterable(
          source,
          (cause) => new ProviderError({ message: '读取模型流失败', cause }),
        );
      }),
    );

    let content = '';
    let finishReason: ChatCompletionChunk.Choice['finish_reason'] = null;
    const calls = new Map<number, ChatCompletionMessageFunctionToolCall>();

    try {
      for await (const chunk of Stream.toAsyncIterable(chunks)) {
        options?.signal?.throwIfAborted();

        const choice = chunk.choices.find((item) => item.index === 0);
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;
        if (choice.delta.content) {
          content += choice.delta.content;
          yield { type: 'text-delta', delta: choice.delta.content };
        }

        for (const part of choice.delta.tool_calls ?? []) {
          if (part.type && part.type !== 'function') throw new Error('暂不支持此类工具');

          const call = calls.get(part.index) ?? {
            id: '',
            type: 'function' as const,
            function: { name: '', arguments: '' },
          };

          // id / name 通常只在首次片段出现；arguments 要按 index 连续拼接。
          if (part.id) call.id = part.id;
          if (part.function?.name) call.function.name = part.function.name;

          call.function.arguments += part.function?.arguments ?? '';
          calls.set(part.index, call);
        }
      }

      options?.signal?.throwIfAborted();
    } catch (cause) {
      options?.signal?.throwIfAborted();
      throw cause;
    }

    // 真正读完这次模型响应之后，才交出完整的工具调用。
    const toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
    if (toolCalls.some((call) => !call.id || !call.function.name)) {
      throw new Error('工具调用缺少标识或名称');
    }

    if (finishReason !== 'stop' && finishReason !== 'tool_calls') {
      throw new Error('模型响应未正常结束或达到输出限制');
    }

    if ((finishReason === 'tool_calls') !== toolCalls.length > 0) {
      throw new Error('模型结束原因与工具调用不一致');
    }

    yield {
      type: 'model-completed',
      turn: {
        finishReason,
        message: {
          role: 'assistant',
          content,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
      },
    };
  };
}
