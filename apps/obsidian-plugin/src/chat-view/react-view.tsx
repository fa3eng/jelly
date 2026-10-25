import { createRoot } from 'react-dom/client';
import type { App } from 'obsidian';
import { ChatPanel, SessionToolbar } from '@jelly/ui';
import type { ServiceConnection } from '../rpc/client';
import { useChat } from './use-chat';
import { MarkdownMessage } from './markdown-message';

function ConnectedChat({ connection, app }: { connection: ServiceConnection; app: App }) {
  const chat = useChat(connection);
  return (
    <div className="osc-chat-workspace">
      <SessionToolbar
        sessions={chat.sessions}
        sessionId={chat.sessionId}
        busy={chat.busy}
        onCreate={() => void chat.selectSession()}
        onSelect={(id) => void chat.selectSession(id)}
        onRefresh={() => {
          if (chat.sessionId) void chat.selectSession(chat.sessionId);
        }}
      />
      {chat.remoteRunning && (
        <p className="osc-notice" role="status">
          上一轮尚未结束，稍后刷新会话。
        </p>
      )}
      {chat.runs.filter(
        (run) =>
          run.status === 'cancelled' || run.status === 'interrupted' || run.status === 'error',
      ).length > 0 && (
        <details className="osc-run-history">
          <summary>有中断或失败的运行 · 查看记录</summary>
          {chat.runs
            .filter(
              (run) =>
                run.status === 'cancelled' ||
                run.status === 'interrupted' ||
                run.status === 'error',
            )
            .map((run) => (
              <div className="osc-run-note" key={run.id}>
                <span>
                  {run.status === 'cancelled'
                    ? '已取消'
                    : run.status === 'interrupted'
                      ? '已中断'
                      : '失败'}
                </span>
                <p>{run.userText || '运行未完成'}</p>
              </div>
            ))}
        </details>
      )}
      {chat.sessionId ? (
        <ChatPanel
          key={chat.sessionId}
          messages={chat.messages}
          status={chat.status}
          onSubmit={(prompt) => void chat.submit(prompt)}
          onInterrupt={chat.interrupt}
          renderAssistant={(message) => <MarkdownMessage app={app} content={message.content} />}
        />
      ) : (
        <div className="osc-chat-loading" role="status">
          {chat.busy ? '正在恢复你的会话…' : '请新建或选择一个会话'}
        </div>
      )}
      {chat.activity && (
        <p className="osc-notice osc-tool-activity" role="status">
          {chat.activity}
        </p>
      )}
      {chat.error && (
        <p className="osc-notice osc-error" role="alert">
          {chat.error}
        </p>
      )}
    </div>
  );
}

/**
 * 将 React 会话界面挂载到 ItemView，并提供原生 Markdown 渲染所需宿主。
 * @returns 由 ItemView.onClose 调用的卸载函数。
 */
export function mountChatPanel(
  container: HTMLElement,
  connection: ServiceConnection,
  app: App,
): () => void {
  const root = createRoot(container);
  root.render(<ConnectedChat connection={connection} app={app} />);
  return () => root.unmount();
}
