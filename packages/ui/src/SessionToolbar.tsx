import { Select } from 'radix-ui';
import { ChatIcon } from './ChatIcon';

interface SessionOption {
  id: string;
  title: string;
  updatedAt: string;
}

export interface SessionToolbarProps {
  sessions: readonly SessionOption[];
  sessionId: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRefresh: () => void;
}

const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** 受控的会话选择工具栏；仅管理展示与键盘交互，不读写会话。 */
export function SessionToolbar({
  sessions,
  sessionId,
  busy,
  onSelect,
  onCreate,
  onRefresh,
}: SessionToolbarProps) {
  return (
    <header className="osc-session-toolbar">
      <div className="osc-workspace-heading">
        <div className="osc-brand">
          <span className="osc-brand-mark">
            <ChatIcon name="book" size={18} />
          </span>
          <div>
            <strong>Jelly</strong>
            <span>你的学习对话</span>
          </div>
        </div>
        <div className="osc-toolbar-actions">
          <button
            type="button"
            className="osc-icon-button"
            title="新建会话"
            aria-label="新建会话"
            disabled={busy}
            onClick={onCreate}
          >
            <ChatIcon name="plus" />
          </button>
          <button
            type="button"
            className="osc-icon-button"
            title="刷新会话"
            aria-label="刷新会话"
            disabled={busy || !sessionId}
            onClick={onRefresh}
          >
            <ChatIcon name="refresh" />
          </button>
        </div>
      </div>
      <Select.Root
        value={sessionId ?? ''}
        onValueChange={onSelect}
        disabled={busy || sessions.length === 0}
      >
        <Select.Trigger className="osc-session-trigger" aria-label="切换会话">
          <ChatIcon name="chat" />
          <Select.Value placeholder={busy ? '正在恢复会话…' : '选择会话'} />
          <Select.Icon className="osc-session-chevron">
            <ChatIcon name="chevron" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="osc-session-menu"
            position="popper"
            sideOffset={6}
            collisionPadding={12}
          >
            <Select.ScrollUpButton className="osc-session-scroll">向上滚动</Select.ScrollUpButton>
            <Select.Viewport>
              <Select.Group>
                <Select.Label className="osc-session-menu-label">最近的会话</Select.Label>
                {sessions.map((session) => (
                  <Select.Item key={session.id} value={session.id} className="osc-session-option">
                    <Select.ItemText>
                      <span className="osc-session-title">{session.title}</span>
                      <span className="osc-session-date">
                        {dateFormat.format(new Date(session.updatedAt))}
                      </span>
                    </Select.ItemText>
                    <Select.ItemIndicator className="osc-session-check">
                      <ChatIcon name="check" size={14} />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Group>
            </Select.Viewport>
            <Select.ScrollDownButton className="osc-session-scroll">
              向下滚动
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </header>
  );
}
