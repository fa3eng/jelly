import { randomUUID } from 'node:crypto';
import type { AgentMessage, AgentRunOptions, AgentStreamItem } from '@aula/agent-runtime';
import type { AgentOutputEvent } from '@aula/domain';
import type { JsonlStore } from './jsonl-store';
import {
  messageSchema,
  type FinishedStatus,
  type SessionRecord,
  type StoredMessage,
} from './records';

interface Run {
  id: string;
  status: 'running' | FinishedStatus;
  messages: StoredMessage[];
}

interface RunInput {
  sessionId: string;
  runId: string;
  prompt: string;
}

/** 接收历史与取消信号，返回 Loop 输出流；不要求依赖具体 Agent 实例。 */
type ExecuteRun = (
  history: AgentMessage[],
  options?: AgentRunOptions,
) => AsyncIterable<AgentStreamItem>;

/**
 * 从合法存储记录重建会话；由 Manager 内部的 read 调用。
 * @param records - Store.read 的记录数组，首条必须是会话头。
 * @returns 会话信息与 Run；没有结束标记的 Run 暂为 running。
 * @throws 会话头、Run ID 或记录顺序不合法；本章暂不做损坏数据容错。
 */
function restore(records: SessionRecord[]) {
  const header = records[0];
  if (header?.type !== 'session-created') throw new Error('缺少会话头');
  const runs = new Map<string, Run>();
  for (const record of records.slice(1)) {
    if (record.type === 'session-created') throw new Error('重复的会话头');
    if (record.type === 'run-started') {
      if (runs.has(record.runId)) throw new Error('重复的运行 id');
      runs.set(record.runId, { id: record.runId, status: 'running', messages: [] });
      continue;
    }
    const run = runs.get(record.runId);
    if (!run || run.status !== 'running') throw new Error('会话记录的运行顺序错误');
    if (record.type === 'message-added') run.messages.push(record.message);
    else run.status = record.status;
  }
  return {
    id: header.sessionId,
    title: header.title,
    updatedAt: records.at(-1)!.at,
    runs: [...runs.values()],
  };
}

/**
 * 将一次历史运行转换为模型可消费的历史；由 beginRun 调用。
 * @param run - 从文件恢复的运行，包含已经保存的消息与结束状态。
 * @returns 正常运行保留原协议消息；异常运行作为带状态的历史记录说明提供。
 */
function toHistory(run: Run): AgentMessage[] {
  if (run.status === 'completed') return run.messages;
  return [
    {
      role: 'user',
      content: [
        `【历史运行记录，非新的用户请求】runId=${run.id}，状态=${run.status}。`,
        '以下是已保存的消息。记录可能不完整，不能据此认定工具未执行，也不要自动重放工具。',
        JSON.stringify(run.messages),
      ].join('\n'),
    },
  ];
}

/**
 * 创建管理会话与消费 Loop 流的 Session Manager；由 Service 启动时调用。
 * @param store - 顺序读写 JSONL 的存储实例。
 * @returns 会话查询与 run 生成器；接收请求前先 await initialize()。
 */
export function createSessionManager(store: JsonlStore) {
  const active = new Map<string, string>();

  /**
   * 加载并重建会话；供本模块的查询和运行准备复用。
   * @param id - 会话 UUID。
   * @returns 从文件恢复的会话对象。
   */
  const read = async (id: string) => restore(await store.read(id));

  /** @returns 新记录使用的当前 UTC ISO 时间。 */
  const now = () => new Date().toISOString();

  /**
   * 保存运行结束状态并释放占用；由 run 的 finally 或启动恢复调用。
   * @param id - 会话 UUID。
   * @param runId - 已开始的运行 UUID。
   * @param status - 正常完成、用户取消、异常中断或执行失败。
   * @returns 结束记录保存完成的 Promise；存储失败仍释放内存占用并向上抛错。
   */
  async function finishRun(id: string, runId: string, status: FinishedStatus) {
    try {
      await store.append(id, { type: 'run-finished', runId, status, at: now() });
    } finally {
      if (active.get(id) === runId) active.delete(id);
    }
  }

  /**
   * 占用会话，读取历史并保存本轮开始与用户消息；仅由 run 内部调用。
   * @param input - 会话 ID、本次提交的唯一 Run ID、用户问题。
   * @returns 历史消息与本轮输入，供 execute 创建 Loop 流。
   * @throws 会话被占用、Run ID 重复、存在遗留运行，或读写失败。
   */
  async function beginRun(input: RunInput): Promise<AgentMessage[]> {
    const { sessionId: id, runId, prompt } = input;
    if (active.has(id)) throw new Error('当前会话正在运行');
    active.set(id, runId);
    let started = false;
    try {
      const session = await read(id);
      if (session.runs.some((run) => run.id === runId)) throw new Error('运行 id 已使用');
      if (session.runs.some((run) => run.status === 'running')) {
        throw new Error('存在未结束的运行，请重启服务恢复会话');
      }
      const history = session.runs.flatMap(toHistory);
      const user = { role: 'user' as const, content: prompt };
      await store.append(id, { type: 'run-started', runId, at: now() });
      started = true;
      await store.append(id, { type: 'message-added', runId, message: user, at: now() });
      return [...history, user];
    } catch (cause) {
      try {
        // 开始标记已落盘时，准备阶段失败也要结束本轮，避免一直残留 running。
        if (started) await finishRun(id, runId, 'error');
      } finally {
        active.delete(id);
      }
      throw cause;
    }
  }

  /**
   * 将 Loop 的完整消息转换为存储记录；仅由 run 内部调用。
   * @param id - 会话 UUID。
   * @param runId - 当前占用会话的运行 UUID。
   * @param message - Loop 已组装的 assistant 消息或 tool 结果。
   * @returns 消息落盘完成的 Promise；校验或写入失败时抛错。
   */
  async function appendMessage(id: string, runId: string, message: AgentMessage) {
    if (active.get(id) !== runId) throw new Error('运行不属于当前会话');
    await store.append(id, {
      type: 'message-added',
      runId,
      message: messageSchema.parse(message),
      at: now(),
    });
  }

  /**
   * 消费 Loop 生成器，保存完整消息，转发展示事件，并管理运行结束状态。
   * @param input - RPC 已校验的会话 ID、Run ID 和用户问题。
   * @param execute - 创建 Loop 流的函数；Service 传入 agent.run。
   * @param options - 可选取消信号；只控制执行，不取消结束状态的保存。
   * @yields AgentOutputEvent，交给 Service/RPC；不向前端暴露内部 message 项。
   * @throws 执行、取消或存储异常；消费提前结束时也会执行 finally 记录 interrupted。
   */
  async function* run(
    input: RunInput,
    execute: ExecuteRun,
    options?: AgentRunOptions,
  ): AsyncGenerator<AgentOutputEvent> {
    options?.signal?.throwIfAborted();
    const history = await beginRun(input);
    let status: FinishedStatus = 'interrupted';
    try {
      for await (const item of execute(history, options)) {
        if (item.type === 'message') {
          await appendMessage(input.sessionId, input.runId, item.message);
        } else {
          options?.signal?.throwIfAborted();
          yield item;
        }
      }
      options?.signal?.throwIfAborted();
      status = 'completed';
    } catch (cause) {
      status = options?.signal?.aborted ? 'cancelled' : 'error';
      throw cause;
    } finally {
      if (status === 'interrupted' && options?.signal?.aborted) status = 'cancelled';
      await finishRun(input.sessionId, input.runId, status);
    }
  }

  return {
    /**
     * 在 Service 监听前标记上次未结束的运行，不自动执行模型或工具。
     * @returns 所有会话初始化完成的 Promise；读写异常向上抛出。
     */
    async initialize() {
      for (const id of await store.ids()) {
        for (const run of (await read(id)).runs) {
          if (run.status === 'running') await finishRun(id, run.id, 'interrupted');
        }
      }
    },
    /**
     * 创建会话，供 sessions.create RPC 使用。
     * @param title - 经过 RPC 校验的非空标题。
     * @returns 新会话的 { id }，返回前会话头已落盘。
     */
    async create(title: string) {
      const id = randomUUID();
      await store.create({ type: 'session-created', version: 1, sessionId: id, title, at: now() });
      return { id };
    },
    /** @returns 会话摘要列表，供 RPC 使用，按最近更新优先排序。 */
    async list() {
      const sessions = await Promise.all((await store.ids()).map(read));
      return sessions
        .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    },
    /**
     * 生成恢复界面所需视图，供 sessions.read RPC 使用。
     * @param id - 会话 UUID。
     * @returns 会话摘要与各 Run 的状态、用户文字和 assistant 文字。
     */
    async view(id: string) {
      const session = await read(id);
      return {
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
        runs: session.runs.map((run) => ({
          id: run.id,
          status: run.status,
          userText: run.messages
            .filter((m) => m.role === 'user')
            .map((m) => m.content)
            .join('\n'),
          assistantText: run.messages
            .filter((m) => m.role === 'assistant')
            .map((m) => m.content)
            .join(''),
        })),
      };
    },
    run,
  };
}

export type SessionManager = ReturnType<typeof createSessionManager>;
