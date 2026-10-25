import { constants } from 'node:fs';
import { mkdir, open, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { recordSchema, type SessionRecord } from './records';

/**
 * 创建单个 Service 进程使用的 JSONL 存储接口。
 * 由 Service 启动流程调用，返回值交给 Session Manager 使用。
 * @param directory - 会话文件所在的绝对目录；不存在时创建。
 * @returns 提供 ids、create、append、read 的 Store；同文件操作在此实例内排队。
 * @throws 创建目录失败。
 */
export async function createJsonlStore(directory: string) {
  await mkdir(directory, { recursive: true });

  // 每个会话只保存队尾，前后顺序由 Promise 链维护。
  const queueTails = new Map<string, Promise<void>>();
  /**
   * 校验会话 ID，并生成该会话的文件路径；由 Store 内部读写方法调用。
   * @param id - 会话 UUID，不接受任意文件路径。
   * @returns 存储目录下的会话 JSONL 路径。
   * @throws id 不是有效 UUID。
   */
  const pathFor = (id: string) => join(directory, `${z.uuid().parse(id)}.jsonl`);

  /**
   * 将一次文件操作排到同会话的前一次操作之后；供 read/create/append 使用。
   * 某次操作失败不阻塞后续排队操作，但失败仍返回给本次调用方。
   * @param sessionId - 用作队列键的会话 ID；不同会话可并行执行。
   * @param action - 轮到本次操作时执行的异步函数。
   * @returns action 的结果；排队期间不会提前执行 action。
   * @throws action 执行时抛出的错误。
   */
  function enqueue<T>(sessionId: string, action: () => Promise<T>): Promise<T> {
    // 等前一个操作结束，再调用本次 action；没有前一个则可以直接开始。
    const previousTail = queueTails.get(sessionId) ?? Promise.resolve();
    const operationResult = previousTail.then(action);

    // 队尾只表示“本次已结束”，不携带失败，让后续操作仍能继续。
    const nextTail = operationResult.then(
      () => undefined,
      () => undefined,
    );
    queueTails.set(sessionId, nextTail);

    void nextTail.then(() => {
      // 只有本次仍是队尾才清理，不能删掉后来排入的操作。
      if (queueTails.get(sessionId) === nextTail) {
        queueTails.delete(sessionId);
      }
    });

    // 调用方拿到真实结果，包括本次操作的错误。
    return operationResult;
  }

  /**
   * 只读加载会话文件；由 Manager 调用并重建会话状态。
   * @param id - 要读取的会话 UUID。
   * @returns 按文件顺序排列的记录数组，包含首条会话头。
   * @throws 文件不可读、JSON 或 Schema 校验失败、会话头与 ID 不匹配。
   */
  async function read(id: string): Promise<SessionRecord[]> {
    return enqueue(id, async () => {
      const text = await readFile(pathFor(id), 'utf8');
      const records = text
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => recordSchema.parse(JSON.parse(line)));
      const header = records[0];
      if (header?.type !== 'session-created' || header.sessionId !== id) {
        throw new Error('会话头记录不匹配');
      }
      return records;
    });
  }

  return {
    read,
    /**
     * 扫描会话目录，供 Manager 的 list/initialize 遍历会话。
     * @returns 文件名为有效 UUID 的 JSONL 会话 ID 列表；不读取正文，不保证顺序。
     * @throws 目录读取失败。
     */
    async ids() {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
        .map((entry) => entry.name.slice(0, -6))
        .filter((id) => z.uuid().safeParse(id).success);
    },
    /**
     * 新建会话文件并保存首条记录；由 Manager.create 调用。
     * @param record - 包含会话 ID、标题、版本和时间的会话头。
     * @returns 首条记录写入并完成 sync 后兑现的 Promise。
     * @throws 记录不合法、同名文件已存在，或文件写入失败。
     */
    async create(record: Extract<SessionRecord, { type: 'session-created' }>) {
      const checked = recordSchema.parse(record);
      return enqueue(record.sessionId, async () => {
        const file = await open(pathFor(record.sessionId), 'wx');
        try {
          await file.writeFile(`${JSON.stringify(checked)}\n`);
          await file.sync();
        } finally {
          await file.close();
        }
      });
    },
    /**
     * 向已有会话追加一条记录；由 Manager 的运行与消息操作调用。
     * @param id - 目标会话 UUID，对应的文件必须已经存在。
     * @param record - 要追加的运行标记或消息记录，不允许用来创建会话头。
     * @returns 记录完整写入并完成 sync 后兑现的 Promise。
     * @throws ID 或记录不合法、文件不存在，或写入失败。
     */
    async append(id: string, record: Exclude<SessionRecord, { type: 'session-created' }>) {
      const checked = recordSchema.parse(record);
      return enqueue(id, async () => {
        // 只以追加模式打开已有文件；不加 O_CREAT，避免错误 ID 创建无头文件。
        const file = await open(pathFor(id), constants.O_WRONLY | constants.O_APPEND);
        try {
          await file.writeFile(`${JSON.stringify(checked)}\n`);
          await file.sync();
        } finally {
          await file.close();
        }
      });
    },
  };
}

export type JsonlStore = Awaited<ReturnType<typeof createJsonlStore>>;
