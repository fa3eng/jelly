import { useEffect, useRef, useState } from 'react';
import type { AssistantRunStatus, ChatMessage } from '@aula/domain';
import type { SessionSummary, SessionView } from '@aula/contracts';
import { createRpcClient, type ServiceConnection } from '../rpc/client';

type RpcClient = ReturnType<typeof createRpcClient>;

/**
 * 将服务端会话视图转换为 ChatPanel 使用的消息列表；由 applyView 调用。
 * @param view - sessions.read RPC 返回的视图；不是 JSONL 原始记录。
 * @returns 用 Run ID 派生消息 ID 的用户与 assistant 展示消息，跳过空文字。
 */
function toMessages(view: SessionView): ChatMessage[] {
  return view.runs.flatMap((run) => {
    const messages: ChatMessage[] = [];
    if (run.userText) messages.push({ id: `${run.id}:user`, role: 'user', content: run.userText });
    if (run.assistantText)
      messages.push({ id: `${run.id}:assistant`, role: 'assistant', content: run.assistantText });
    return messages;
  });
}

/**
 * 管理聊天界面的恢复、会话切换、提交和取消；由 ConnectedChat 使用。
 * @param connection - Service 的 RPC 连接配置，用于创建客户端。
 * @returns 界面状态与操作函数；messages 仅用于显示，后续模型历史由 Session 读取。
 */
export function useChat(connection: ServiceConnection) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AssistantRunStatus>('restoring');
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [view, setView] = useState<SessionView | null>(null);
  const selected = useRef<string | null>(null);
  const api = useRef<RpcClient | null>(null);
  const active = useRef<AbortController | null>(null);
  const loading = useRef(false);

  /**
   * 将服务端视图应用到本地界面；由 load 调用。
   * @param next - 当前客户端读取到的会话视图。
   * @returns 无返回值；更新选中会话、Run 视图和展示消息。
   */
  function applyView(next: SessionView) {
    selected.current = next.id;
    setView(next);
    setMessages(toMessages(next));
  }

  /**
   * 读取会话视图与列表，再刷新界面；供初始化、切换和提交结束后复用。
   * @param client - 发起本次读取的客户端；若已被替换，不应用过期响应。
   * @param id - 要恢复到界面的会话 UUID。
   * @returns 读取和界面更新完成后兑现的 Promise。
   * @throws RPC 读取失败，由调用方更新错误状态。
   */
  async function load(client: RpcClient, id: string) {
    const next = await client.client.sessions.read({ sessionId: id });
    const list = await client.client.sessions.list({});
    if (api.current !== client) return;
    applyView(next);
    setSessions(list);
  }

  useEffect(() => {
    const client = createRpcClient(connection);
    api.current = client;
    loading.current = true;
    selected.current = null;

    void (async () => {
      // 连接切换后异步初始化，过期客户端不能重置新连接的界面。
      await Promise.resolve();
      if (api.current !== client) return;
      setView(null);
      setMessages([]);
      setError(null);
      setStatus('restoring');
      try {
        const list = await client.client.sessions.list({});
        if (api.current !== client) return;
        const id = list[0]?.id ?? (await client.client.sessions.create({ title: '新会话' })).id;
        if (api.current !== client) return;
        await load(client, id);
        if (api.current === client) setStatus('idle');
      } catch (cause) {
        if (api.current === client) {
          setError(cause instanceof Error ? cause.message : '会话恢复失败');
          setStatus('error');
        }
      } finally {
        if (api.current === client) loading.current = false;
      }
    })();

    return () => {
      active.current?.abort();
      client.close();
      if (api.current === client) api.current = null;
    };
  }, [connection]);

  /**
   * 响应新建、切换或刷新会话；由会话选择器与按钮调用。
   * @param id - 已有会话 UUID；省略时先创建新会话，再读取视图。
   * @returns 操作完成后兑现的 Promise；忙碌时直接返回，错误在内部转换为界面状态。
   */
  async function selectSession(id?: string) {
    const client = api.current;
    if (!client || active.current || loading.current) return;
    loading.current = true;
    setStatus('restoring');
    setError(null);
    try {
      // 未传 id 表示新建；传入 id 表示切换。
      const nextId = id ?? (await client.client.sessions.create({ title: '新会话' })).id;
      if (api.current !== client) return;
      await load(client, nextId);
      if (api.current === client) setStatus('idle');
    } catch (cause) {
      if (api.current === client) {
        setError(cause instanceof Error ? cause.message : '会话读取失败');
        setStatus('error');
      }
    } finally {
      if (api.current === client) loading.current = false;
    }
  }

  /**
   * 提交本轮问题，消费流式事件，并在结束后重新读取服务端保存的会话。
   * 由 ChatPanel 的 onSubmit 调用；前端不上传 assistant 或工具历史。
   * @param prompt - 用户输入的本轮问题。
   * @returns 请求与结束后刷新完成时兑现的 Promise；取消或失败反映到界面状态。
   */
  async function submit(prompt: string) {
    const client = api.current;
    const sessionId = selected.current;
    if (!client || !sessionId || active.current || loading.current) return;
    if (view?.runs.some((run) => run.status === 'running')) return;

    const controller = new AbortController();
    active.current = controller;
    const runId = crypto.randomUUID();
    const assistantId = `${runId}:assistant`;
    setMessages((previous) => [
      ...previous,
      { id: `${runId}:user`, role: 'user', content: prompt },
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setError(null);
    setActivity(null);
    setStatus('running');
    let answer = '';
    let completed = false;
    let outcome: AssistantRunStatus = 'idle';

    try {
      const events = await client.client.chat.stream(
        { sessionId, runId, prompt },
        { signal: controller.signal },
      );
      for await (const event of events) {
        if (api.current !== client || controller.signal.aborted) break;
        switch (event.type) {
          case 'text-delta': {
            answer += event.delta;
            const content = answer;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId ? { ...message, content } : message,
              ),
            );
            setActivity(null);
            setStatus('streaming');
            break;
          }
          case 'tool-started':
            setActivity(`正在调用工具：${event.name}`);
            setStatus('running');
            break;
          case 'tool-finished':
            setActivity(
              event.ok ? '工具已完成，模型正在决定下一步…' : '工具未完成，模型正在处理结果…',
            );
            setStatus('running');
            break;
          case 'done':
            completed = true;
            break;
        }
      }
      if (controller.signal.aborted) outcome = 'interrupted';
      else if (!completed) throw new Error('回答意外中断，请刷新会话');
    } catch (cause) {
      outcome = controller.signal.aborted ? 'interrupted' : 'error';
      if (api.current === client && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : '请求失败');
      }
    } finally {
      if (api.current === client) {
        try {
          // 不使用已取消的 controller；重新读取服务端真正保存的记录。
          await load(client, sessionId);
        } catch (cause) {
          if (api.current === client) {
            setError(cause instanceof Error ? cause.message : '会话刷新失败');
            outcome = 'error';
          }
        } finally {
          if (active.current === controller) active.current = null;
          if (api.current === client) {
            setActivity(null);
            setStatus(outcome);
          }
        }
      } else if (active.current === controller) active.current = null;
    }
  }

  const remoteRunning = view?.runs.some((run) => run.status === 'running') ?? false;
  return {
    messages,
    status: remoteRunning ? ('restoring' as const) : status,
    error,
    activity,
    sessions,
    sessionId: view?.id ?? null,
    runs: view?.runs ?? [],
    remoteRunning,
    busy: status === 'restoring' || status === 'running' || status === 'streaming',
    selectSession,
    submit,
    interrupt: () => active.current?.abort(),
  };
}
