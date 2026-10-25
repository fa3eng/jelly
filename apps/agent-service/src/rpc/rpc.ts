import { implement, ORPCError } from '@orpc/server';
import { agentContract, type ChatGenerateInput } from '@aula/contracts';
import type { AgentOutputEvent } from '@aula/domain';
import type { SessionManager } from '../session/session';

export type GenerateText = (
  input: ChatGenerateInput,
  options?: { signal?: AbortSignal },
) => Promise<string>;
export type GenerateStream = (
  input: ChatGenerateInput,
  options?: { signal?: AbortSignal },
) => AsyncIterable<AgentOutputEvent>;

/**
 * 将内部异常转换为对外的 RPC 错误；由 guarded 和流式处理器调用。
 * @param cause - 捕获到的异常；已有 ORPCError 原样保留，其余替换为通用错误。
 * @returns 不正常返回，总是抛出异常，避免泄露内部路径与服务商错误。
 */
/**
 * 将内部错误转为不泄露文件路径或服务商详情的 RPC 错误。
 * @param cause - 会话查询、保存或生成过程中捕获的异常。
 * @returns 不正常返回，总是抛出对外错误。
 */
function failure(cause: unknown): never {
  if (cause instanceof ORPCError) throw cause;
  throw new ORPCError('INTERNAL_SERVER_ERROR', { message: '会话操作失败，请重试' });
}

/**
 * 为普通 RPC 操作统一转换异常；供会话接口和非流式生成接口使用。
 * @param action - 实际执行 Manager 查询、写入或生成操作的异步函数。
 * @returns action 的成功结果。
 * @throws failure 转换后的 RPC 错误。
 */
/**
 * 统一普通 RPC 请求的异常处理；流式请求在迭代过程中自行捕获。
 * @param action - 实际执行的会话操作或完整回答生成函数。
 * @returns action 的成功结果，失败时抛出对外 RPC 错误。
 */
async function guarded<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (cause) {
    return failure(cause);
  }
}

/**
 * 创建 RPC 路由，将客户端调用连接到 Service 与 Session Manager。
 * 由 HTTP 应用创建流程调用，返回值交给 RPCHandler。
 * @param generateText - 消费一次回答并返回完整文字的 Service 函数。
 * @param generateStream - 提供回答事件流并管理持久化生命周期的 Service 函数。
 * @param sessions - 已初始化的会话管理器，供创建、列出和读取会话使用。
 * @returns 符合 agentContract 的会话与聊天路由。
 */
/**
 * 将会话管理与展示事件流绑定到 RPC 契约；由 HTTP 应用创建流程调用。
 * @param generateText - 返回完整正文的 Service 函数。
 * @param generateStream - 由 Session 管理保存和生命周期的展示事件流。
 * @param sessions - 已初始化的会话管理器，提供创建、列表与读取操作。
 * @returns 受同一 HTTP 鉴权保护的会话与聊天路由。
 */
export function createRpcRouter(
  generateText: GenerateText,
  generateStream: GenerateStream,
  sessions: SessionManager,
) {
  const service = implement(agentContract);
  const create = service.sessions.create.handler(({ input }) =>
    guarded(() => sessions.create(input.title)),
  );
  const list = service.sessions.list.handler(() => guarded(() => sessions.list()));
  const read = service.sessions.read.handler(({ input }) =>
    guarded(() => sessions.view(input.sessionId)),
  );
  const generate = service.chat.generate.handler(({ input, signal }) =>
    guarded(async () => ({ text: await generateText(input, { signal }) })),
  );
  const stream = service.chat.stream.handler(async function* ({ input, signal }) {
    try {
      for await (const event of generateStream(input, { signal })) {
        signal?.throwIfAborted();
        yield event;
      }
      signal?.throwIfAborted();
      yield { type: 'done' as const };
    } catch (cause) {
      if (signal?.aborted) throw cause;
      failure(cause);
    }
  });
  return service.router({ sessions: { create, list, read }, chat: { generate, stream } });
}
