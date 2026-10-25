import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentMessage, AgentStreamItem } from '@aula/agent-runtime';
import { createJsonlStore } from './jsonl-store';
import { createSessionManager } from './session';

async function collect(stream: AsyncIterable<unknown>) {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe('Session lifecycle', () => {
  let directory: string;
  let store: Awaited<ReturnType<typeof createJsonlStore>>;
  let sessions: ReturnType<typeof createSessionManager>;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'aula-session-'));
    store = await createJsonlStore(directory);
    sessions = createSessionManager(store);
  });
  afterEach(async () => rm(directory, { recursive: true, force: true }));

  it('persists cancellation and allows the next submission with the cancelled history', async () => {
    const { id } = await sessions.create('取消验证');
    const controller = new AbortController();
    const stream = sessions.run(
      { sessionId: id, runId: randomUUID(), prompt: '第一问' },
      async function* (_history, options) {
        yield { type: 'message', message: { role: 'assistant', content: '已完成的消息' } };
        yield { type: 'text-delta', delta: '未完成的片段' };
        options?.signal?.throwIfAborted();
      },
      { signal: controller.signal },
    );
    await stream.next();
    controller.abort();
    await expect(stream.next()).rejects.toThrow();
    expect((await sessions.view(id)).runs[0]).toMatchObject({
      status: 'cancelled',
      assistantText: '已完成的消息',
    });
    const seen: AgentMessage[][] = [];
    await collect(
      sessions.run(
        { sessionId: id, runId: randomUUID(), prompt: '继续' },
        async function* (history) {
          seen.push(history);
          yield { type: 'message', message: { role: 'assistant', content: '继续回答' } };
        },
      ),
    );
    expect(JSON.stringify(seen[0])).toContain('cancelled');
    expect(JSON.stringify(seen[0])).toContain('已完成的消息');
  });

  it('saves tool calls and results before continuing, and only forwards display events', async () => {
    const { id } = await sessions.create('工具验证');
    const runId = randomUUID();
    const events = await collect(
      sessions.run(
        { sessionId: id, runId, prompt: '查询' },
        async function* (): AsyncGenerator<AgentStreamItem> {
          yield {
            type: 'message',
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'read', arguments: '{}' } },
              ],
            },
          };
          expect((await store.read(id)).filter((r) => r.type === 'message-added')).toHaveLength(2);
          yield { type: 'tool-started', callId: 'call_1', name: 'read' };
          yield {
            type: 'message',
            message: { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' },
          };
          yield { type: 'tool-finished', callId: 'call_1', name: 'read', ok: true };
          yield { type: 'text-delta', delta: '结果' };
          yield { type: 'message', message: { role: 'assistant', content: '结果' } };
        },
      ),
    );
    expect(events).toEqual([
      { type: 'tool-started', callId: 'call_1', name: 'read' },
      { type: 'tool-finished', callId: 'call_1', name: 'read', ok: true },
      { type: 'text-delta', delta: '结果' },
    ]);
    const restored = createSessionManager(await createJsonlStore(directory));
    await restored.initialize();
    expect((await restored.view(id)).runs[0]).toMatchObject({
      status: 'completed',
      assistantText: '结果',
    });
  });

  it('closes the upstream generator on early return and releases the session', async () => {
    const { id } = await sessions.create('中断验证');
    let closed = false;
    const stream = sessions.run(
      { sessionId: id, runId: randomUUID(), prompt: '开始' },
      async function* () {
        try {
          yield { type: 'text-delta', delta: '片段' };
        } finally {
          closed = true;
        }
      },
    );
    await stream.next();
    await stream.return(undefined);
    expect(closed).toBe(true);
    expect((await sessions.view(id)).runs[0].status).toBe('interrupted');
    await expect(
      collect(
        sessions.run({ sessionId: id, runId: randomUUID(), prompt: '继续' }, async function* () {}),
      ),
    ).resolves.toEqual([]);
  });

  it('rejects concurrent runs in one session while allowing another session', async () => {
    const first = await sessions.create('一');
    const second = await sessions.create('二');
    const stream = sessions.run(
      { sessionId: first.id, runId: randomUUID(), prompt: '开始' },
      async function* () {
        yield { type: 'text-delta', delta: '片段' };
      },
    );
    await stream.next();
    await expect(
      collect(
        sessions.run(
          { sessionId: first.id, runId: randomUUID(), prompt: '重复' },
          async function* () {},
        ),
      ),
    ).rejects.toThrow('正在运行');
    await expect(
      collect(
        sessions.run(
          { sessionId: second.id, runId: randomUUID(), prompt: '独立' },
          async function* () {},
        ),
      ),
    ).resolves.toEqual([]);
    await stream.return(undefined);
  });

  it('keeps a failed run and exposes its status to the next model history', async () => {
    const { id } = await sessions.create('失败验证');
    await expect(
      collect(
        sessions.run({ sessionId: id, runId: randomUUID(), prompt: '执行' }, async function* () {
          yield { type: 'message', message: { role: 'assistant', content: '已有记录' } };
          throw new Error('模型失败');
        }),
      ),
    ).rejects.toThrow('模型失败');
    expect((await sessions.view(id)).runs[0]).toMatchObject({
      status: 'error',
      assistantText: '已有记录',
    });
  });

  it('ends a partially started run when saving the user message fails', async () => {
    const { id } = await sessions.create('准备失败');
    let failNextUserMessage = true;
    const manager = createSessionManager({
      ...store,
      async append(sessionId, record) {
        if (
          failNextUserMessage &&
          record.type === 'message-added' &&
          record.message.role === 'user'
        ) {
          failNextUserMessage = false;
          throw new Error('用户消息保存失败');
        }
        await store.append(sessionId, record);
      },
    });
    await expect(
      collect(
        manager.run(
          { sessionId: id, runId: randomUUID(), prompt: '第一问' },
          async function* () {},
        ),
      ),
    ).rejects.toThrow('用户消息保存失败');
    expect((await manager.view(id)).runs[0].status).toBe('error');
    await expect(
      collect(
        manager.run({ sessionId: id, runId: randomUUID(), prompt: '重试' }, async function* () {}),
      ),
    ).resolves.toEqual([]);
  });

  it('recovers unfinished persisted runs on startup without reexecuting anything', async () => {
    const { id } = await sessions.create('恢复验证');
    const runId = randomUUID();
    const at = new Date().toISOString();
    await store.append(id, { type: 'run-started', runId, at });
    await store.append(id, {
      type: 'message-added',
      runId,
      at,
      message: { role: 'user', content: '未完成的问题' },
    });
    const restarted = createSessionManager(await createJsonlStore(directory));
    await restarted.initialize();
    expect((await restarted.view(id)).runs[0]).toMatchObject({
      status: 'interrupted',
      userText: '未完成的问题',
    });
  });
});
