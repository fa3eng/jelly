import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { AgentClient, ChatStreamEvent } from '@jelly/contracts';
import type { AgentStreamItem } from '../../../../packages/agent-runtime/src/agent/loop';
import { createApp } from '../../../agent-service/src/app/app';
import { createJsonlStore } from '../../../agent-service/src/session/jsonl-store';
import { createSessionManager } from '../../../agent-service/src/session/session';
import { createRpcClient } from './client';

async function collect(source: AsyncIterable<ChatStreamEvent>) {
  const events = [];
  for await (const event of source) events.push(event);
  return events;
}

describe('Session RPC over HTTP', () => {
  let directory: string;
  let sessions: ReturnType<typeof createSessionManager>;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'jelly-rpc-'));
    sessions = createSessionManager(await createJsonlStore(directory));
    await sessions.initialize();
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  function setup(
    options: { token?: string; origin?: string; fail?: boolean; pause?: boolean } = {},
  ) {
    const app = createApp({
      token: 'test-token',
      allowedOrigin: 'app://obsidian.md',
      sessions,
      generateStream: (input, requestOptions) =>
        sessions.run(
          input,
          async function* (history): AsyncGenerator<AgentStreamItem> {
            yield { type: 'tool-started', callId: 'call_1', name: 'read' };
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
            yield {
              type: 'message',
              message: {
                role: 'tool',
                tool_call_id: 'call_1',
                content: '{"ok":true,"data":"工具内容"}',
              },
            };
            yield { type: 'tool-finished', callId: 'call_1', name: 'read', ok: true };
            const content = history[0].content;
            if (typeof content !== 'string') throw new Error('Expected text history');
            const text = content;
            yield { type: 'text-delta', delta: text };
            if (options.fail) throw new Error('private upstream diagnostic');
            if (options.pause) {
              await new Promise<void>((_resolve, reject) => {
                const signal = requestOptions!.signal!;
                const abort = () => reject(signal.reason);
                if (signal.aborted) abort();
                else signal.addEventListener('abort', abort, { once: true });
              });
            }
            yield { type: 'message', message: { role: 'assistant', content: text } };
          },
          requestOptions,
        ),
    });
    const transport: typeof fetch = async (request, init) => {
      const source = request instanceof Request ? request : new Request(request, init);
      const headers = new Headers(source.headers);
      headers.set('Origin', options.origin ?? 'app://obsidian.md');
      return app.request(new Request(source, { ...init, headers }));
    };
    const client: AgentClient = createORPCClient(
      new RPCLink({
        url: 'http://localhost/rpc',
        headers: { Authorization: `Bearer ${options.token ?? 'test-token'}` },
        fetch: transport,
      }),
    );
    return { app, client, transport };
  }

  it('creates, lists and restores a session while keeping internal messages off the wire', async () => {
    const { client } = setup();
    const { id } = await client.sessions.create({ title: '会话一' });
    const input = { sessionId: id, runId: randomUUID(), prompt: '代号蓝鲸42' };
    const events = await collect(await client.chat.stream(input));
    expect(events.map((event) => event.type)).toEqual([
      'tool-started',
      'tool-finished',
      'text-delta',
      'done',
    ]);
    expect(await client.sessions.list({})).toEqual([
      expect.objectContaining({ id, title: '会话一' }),
    ]);
    expect((await client.sessions.read({ sessionId: id })).runs[0]).toMatchObject({
      status: 'completed',
      userText: '代号蓝鲸42',
      assistantText: '代号蓝鲸42',
    });
    sessions = createSessionManager(await createJsonlStore(directory));
    await sessions.initialize();
    const restarted = setup().client;
    expect(
      await restarted.chat.generate({ sessionId: id, runId: randomUUID(), prompt: '代号是什么？' }),
    ).toEqual({ text: '代号蓝鲸42' });
    const second = await restarted.sessions.create({ title: '会话二' });
    expect(
      await restarted.chat.generate({
        sessionId: second.id,
        runId: randomUUID(),
        prompt: '独立问题',
      }),
    ).toEqual({ text: '独立问题' });
  });

  it('saves error status without emitting done or leaking provider details', async () => {
    const { client } = setup({ fail: true });
    const { id } = await client.sessions.create({ title: '失败会话' });
    const events: ChatStreamEvent[] = [];
    await expect(async () => {
      for await (const event of await client.chat.stream({
        sessionId: id,
        runId: randomUUID(),
        prompt: '问题',
      }))
        events.push(event);
    }).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: '会话操作失败，请重试' });
    expect(events.some((event) => event.type === 'done')).toBe(false);
    expect((await client.sessions.read({ sessionId: id })).runs[0].status).toBe('error');
  });

  it.each([
    { messages: [{ role: 'user', content: '旧输入' }] },
    { sessionId: 'bad-id', runId: randomUUID(), prompt: '问题' },
    { sessionId: randomUUID(), runId: randomUUID(), prompt: ' ' },
    { sessionId: randomUUID(), runId: randomUUID(), prompt: 42 },
  ])('rejects invalid input: %j', async (input) => {
    const { client } = setup();
    await expect(client.chat.generate(input as never)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it.each([
    ['wrong-token', 'app://obsidian.md', 401],
    ['test-token', 'https://untrusted.example', 403],
  ] as const)('protects session APIs with token and Origin', async (token, origin, status) => {
    const { client } = setup({ token, origin });
    await expect(client.sessions.create({ title: '无权创建' })).rejects.toMatchObject({ status });
    expect(await sessions.list()).toEqual([]);
  });

  it('allows authenticated POST preflight', async () => {
    const { app } = setup();
    const response = await app.request('/rpc/sessions/create', {
      method: 'OPTIONS',
      headers: {
        Origin: 'app://obsidian.md',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('app://obsidian.md');
  });

  it('persists cancellation after streaming starts and allows the next HTTP submission', async () => {
    const { client } = setup({ pause: true });
    const { id } = await client.sessions.create({ title: '流式取消' });
    const controller = new AbortController();
    const events = await client.chat.stream(
      { sessionId: id, runId: randomUUID(), prompt: '开始' },
      { signal: controller.signal },
    );
    const iterator = events[Symbol.asyncIterator]();
    // 先消费到正文，确保请求已经越过响应头，并且服务端进入等待中的模型流。
    while (true) {
      const next = await iterator.next();
      if (next.done) throw new Error('正文到达前流已结束');
      if (next.value.type === 'text-delta') break;
    }
    controller.abort();
    await expect(iterator.next()).rejects.toThrow();
    await vi.waitFor(async () => {
      expect((await sessions.view(id)).runs[0].status).toBe('cancelled');
    });
    const next = setup().client;
    await expect(
      next.chat.generate({ sessionId: id, runId: randomUUID(), prompt: '继续' }),
    ).resolves.toHaveProperty('text');
    expect((await next.sessions.read({ sessionId: id })).runs[1].status).toBe('completed');
  });

  it('uses the plugin client for session creation and non-streaming generation', async () => {
    const { transport } = setup();
    vi.stubGlobal('fetch', transport);
    const api = createRpcClient({ baseUrl: 'http://localhost', authorizationToken: 'test-token' });
    try {
      const { id } = await api.client.sessions.create({ title: '客户端会话' });
      expect(
        await api.client.chat.generate({ sessionId: id, runId: randomUUID(), prompt: '你好' }),
      ).toEqual({ text: '你好' });
    } finally {
      api.close();
    }
  });

  it.each(['close', 'caller abort'] as const)(
    'ends an in-flight plugin request on %s',
    async (action) => {
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      vi.stubGlobal(
        'fetch',
        (_request: Request, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init.signal!;
            const abort = () => reject(signal.reason);
            if (signal.aborted) abort();
            else signal.addEventListener('abort', abort, { once: true });
            started();
          }),
      );
      const api = createRpcClient({
        baseUrl: 'http://localhost',
        authorizationToken: 'test-token',
      });
      const controller = new AbortController();
      const pending = api.client.chat.generate(
        { sessionId: randomUUID(), runId: randomUUID(), prompt: '你好' },
        { signal: controller.signal },
      );
      const rejected = expect(pending).rejects.toThrow();
      await ready;
      if (action === 'close') api.close();
      else controller.abort();
      await rejected;
      api.close();
    },
  );
});
