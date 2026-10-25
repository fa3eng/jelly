export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
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
