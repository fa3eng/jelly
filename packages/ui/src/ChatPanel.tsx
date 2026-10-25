import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { AssistantRunStatus, ChatMessage } from '@aula/domain';
import { Dialog } from './Dialog';
import { ChatIcon } from './ChatIcon';
import { shouldSubmitOnEnter } from './composer-keys';

export interface ChatPanelProps {
  messages: readonly ChatMessage[];
  status: AssistantRunStatus;
  onSubmit: (prompt: string) => void;
  onInterrupt: () => void;
  /** 宿主提供的助手回复渲染器；共享 UI 不依赖 Obsidian。 */
  renderAssistant?: (message: ChatMessage) => ReactNode;
}

const statusText: Record<AssistantRunStatus, string> = {
  idle: '就绪',
  streaming: '正在生成…',
  running: '正在思考…',
  restoring: '正在恢复会话…',
  interrupted: '已停止',
  error: '运行遇到问题',
};

export function ChatPanel({
  messages,
  status,
  onSubmit,
  onInterrupt,
  renderAssistant,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const scrollContainer = useRef<HTMLDivElement>(null);
  const messageList = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const isBusy = status === 'streaming' || status === 'restoring' || status === 'running';

  useEffect(() => {
    const scroll = scrollContainer.current;
    const content = messageList.current;
    if (!scroll || !content) return;
    // Markdown 渲染与代码高亮可能异步改变高度；用户上翻阅读时不抢滚动位置。
    const observer = new ResizeObserver(() => {
      if (followOutput.current) scroll.scrollTop = scroll.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  /** 表单提交与 Enter 共用入口；忙碌或只有空白时不发送。 */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || isBusy) return;
    followOutput.current = true;
    onSubmit(prompt);
    setDraft('');
  }

  return (
    <section className="osc-chat-panel" aria-label="学习助手对话">
      <header className="osc-chat-header">
        <span>对话</span>
        <Dialog
          trigger="会话详情"
          title="当前会话"
          description="会话保存在本地，可通过上方列表切换和恢复。"
        >
          <p>当前状态：{statusText[status]}</p>
          <p>消息数量：{messages.length}</p>
        </Dialog>
      </header>
      <div
        className="osc-chat-messages"
        role="log"
        aria-label="对话记录"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={isBusy}
        ref={scrollContainer}
        onScroll={(event) => {
          const el = event.currentTarget;
          followOutput.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        <div className="osc-message-list" ref={messageList}>
          {messages.length === 0 ? (
            <div className="osc-chat-empty">
              <span className="osc-empty-icon">
                <ChatIcon name="book" size={26} />
              </span>
              <h3>从一个问题开始</h3>
              <p>阅读笔记，梳理概念，留住你的思考。</p>
            </div>
          ) : (
            messages.map((message) => (
              <article className={`osc-message osc-message-${message.role}`} key={message.id}>
                <div className="osc-message-label">{message.role === 'user' ? '你' : 'Aula'}</div>
                <div className="osc-message-content">
                  {message.role === 'assistant' && !message.content ? (
                    <span className="osc-thinking">正在思考…</span>
                  ) : message.role === 'assistant' && renderAssistant ? (
                    renderAssistant(message)
                  ) : (
                    message.content
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
      <form className="osc-chat-composer" onSubmit={handleSubmit}>
        <textarea
          aria-label="输入问题"
          placeholder="问一个问题，或继续你的思考…"
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          disabled={isBusy}
          onKeyDown={(event) => {
            if (
              !isBusy &&
              shouldSubmitOnEnter({
                key: event.key,
                shiftKey: event.shiftKey,
                isComposing: event.nativeEvent.isComposing,
                keyCode: event.nativeEvent.keyCode,
              })
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="osc-composer-footer">
          <div className="osc-composer-meta">
            <span className={`osc-status-dot ${isBusy ? 'is-active' : ''}`} />
            <span className="osc-chat-status" role="status">
              {statusText[status]}
            </span>
            <span className="osc-composer-hint">Shift + Enter 换行</span>
          </div>
          {status === 'streaming' || status === 'running' ? (
            <button
              type="button"
              className="osc-send-button is-stop"
              title="停止生成"
              aria-label="停止生成"
              onClick={onInterrupt}
            >
              <ChatIcon name="stop" />
            </button>
          ) : (
            <button
              type="submit"
              className="osc-send-button"
              title="发送消息（Enter）"
              aria-label="发送消息"
              disabled={!draft.trim() || isBusy}
            >
              <ChatIcon name="send" />
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
