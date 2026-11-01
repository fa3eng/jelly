export type ChatRole = 'user' | 'assistant';

/** 用户主动附加的 Markdown 提问引用；文字是捕获时的快照。 */
export interface QuestionReference {
  id: string;
  path: string;
  text: string;
  from: { line: number; ch: number };
  to: { line: number; ch: number };
  question: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  references?: QuestionReference[];
}

export type ConversationMessage = Pick<ChatMessage, 'role' | 'content'>;

export type AssistantRunStatus =
  | 'idle'
  | 'streaming'
  | 'running'
  | 'restoring'
  | 'interrupted'
  | 'error';

export type AgentEvent =
  | { type: 'run-started'; runId: string }
  | { type: 'text-delta'; runId: string; delta: string }
  | { type: 'run-completed'; runId: string }
  | { type: 'run-interrupted'; runId: string }
  | { type: 'run-error'; runId: string; message: string }
  | { type: 'session-restored'; sessionId: string; messages: ChatMessage[] };

export type AgentOutputEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-started'; callId: string; name: string }
  | { type: 'tool-finished'; callId: string; name: string; ok: boolean };
