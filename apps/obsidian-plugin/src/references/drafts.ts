import { z } from 'zod';
import { questionReferenceSchema, questionReferencesSchema } from '@jelly/contracts';
import type { QuestionReference } from '@jelly/domain';

const sendingSchema = z.object({
  runId: z.uuid(),
  prompt: z.string(),
  references: questionReferencesSchema,
});
const draftSchema = z.object({
  prompt: z.string().default(''),
  references: z.array(questionReferenceSchema).max(60).default([]),
  pending: questionReferenceSchema.optional(),
  sending: sendingSchema.optional(),
});
export type ReferenceDraft = z.infer<typeof draftSchema>;
const emptyDraft = (): ReferenceDraft => ({ prompt: '', references: [] });

/** 插件持有草稿，不随 React 面板卸载或服务重启而丢失。 */
export class ReferenceDraftStore {
  private drafts: Record<string, ReferenceDraft> = {};
  private listeners = new Set<() => void>();
  private state: { sessionId: string | null; draft: ReferenceDraft; error: string | null } = {
    sessionId: null,
    draft: emptyDraft(),
    error: null,
  };
  private saving = Promise.resolve();

  constructor(
    data: unknown,
    private readonly save: (data: Record<string, ReferenceDraft>) => Promise<void>,
  ) {
    if (data && typeof data === 'object') {
      for (const [id, value] of Object.entries(data)) {
        const parsed = draftSchema.safeParse(value);
        if (z.uuid().safeParse(id).success && parsed.success) this.drafts[id] = parsed.data;
      }
    }
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    for (const listener of this.listeners) listener();
  }
  activate(sessionId: string | null) {
    if (sessionId === this.state.sessionId) return;
    this.state = {
      ...this.state,
      sessionId,
      draft: sessionId ? (this.drafts[sessionId] ?? emptyDraft()) : emptyDraft(),
    };
    this.emit();
  }
  private update(change: (draft: ReferenceDraft) => ReferenceDraft, id = this.state.sessionId) {
    if (!id) return;
    const draft = change(this.drafts[id] ?? emptyDraft());
    if (draft === this.drafts[id]) return;
    const parsed = draftSchema.safeParse(draft);
    if (!parsed.success)
      throw new Error('最多添加 30 条引用；每条原文最多 20,000 字符，总长度最多 120,000 字符。');
    this.drafts = { ...this.drafts, [id]: parsed.data };
    if (id === this.state.sessionId) this.state = { ...this.state, draft: parsed.data };
    this.emit();
    const snapshot = structuredClone(this.drafts);
    this.saving = this.saving
      .catch(() => {})
      .then(() => this.save(snapshot))
      .then(() => {
        if (this.state.error) {
          this.state = { ...this.state, error: null };
          this.emit();
        }
      })
      .catch(() => {
        this.state = {
          ...this.state,
          error: '提问草稿保存失败，当前内容仍保留在内存中。请检查磁盘空间。',
        };
        this.emit();
      });
  }
  flush() {
    return this.saving;
  }
  setPrompt(prompt: string) {
    this.update((draft) => ({ ...draft, prompt }));
  }
  begin(reference: QuestionReference) {
    if (!this.state.sessionId) throw new Error('请先在 Jelly 中新建或选择一个会话。');
    if (this.state.draft.pending) return false;
    if (this.state.draft.references.length >= 30)
      throw new Error('最多添加 30 条提问引用，请先发送或移除部分引用。');
    this.update((draft) => ({ ...draft, pending: reference }));
    return true;
  }
  setPendingQuestion(question: string) {
    this.update((draft) => ({
      ...draft,
      pending: draft.pending ? { ...draft.pending, question } : undefined,
    }));
  }
  finishPending() {
    this.update((draft) =>
      draft.pending
        ? {
            ...draft,
            pending: undefined,
            references: [
              ...draft.references,
              { ...draft.pending, question: draft.pending.question.trim() },
            ],
          }
        : draft,
    );
  }
  cancelPending() {
    this.update((draft) => ({ ...draft, pending: undefined }));
  }
  edit(id: string, question: string) {
    this.update((draft) => ({
      ...draft,
      references: draft.references.map((reference) =>
        reference.id === id ? { ...reference, question } : reference,
      ),
    }));
  }
  remove(id: string) {
    this.update((draft) => ({
      ...draft,
      references: draft.references.filter((reference) => reference.id !== id),
    }));
  }
  /** 立即移走已发送快照；备份随草稿落盘，供失败或重启恢复。 */
  startSending(
    sessionId: string,
    runId: string,
    prompt: string,
    references: readonly QuestionReference[],
  ) {
    const sent = new Map(references.map((reference) => [reference.id, JSON.stringify(reference)]));
    this.update(
      (draft) => ({
        ...draft,
        prompt: draft.prompt.trim() === prompt.trim() ? '' : draft.prompt,
        references: draft.references.filter(
          (reference) => sent.get(reference.id) !== JSON.stringify(reference),
        ),
        sending: { runId, prompt, references: structuredClone([...references]) },
      }),
      sessionId,
    );
  }

  settleSending(sessionId: string, runId: string, success: boolean) {
    this.update((draft) => {
      const sending = draft.sending;
      if (sending?.runId !== runId) return draft;
      if (success) return { ...draft, sending: undefined };
      const currentIds = new Set(draft.references.map((reference) => reference.id));
      return {
        ...draft,
        sending: undefined,
        prompt: !draft.prompt.trim()
          ? sending.prompt
          : !sending.prompt.trim() || draft.prompt === sending.prompt
            ? draft.prompt
            : `${sending.prompt}\n\n${draft.prompt}`,
        references: [
          ...sending.references.filter((reference) => !currentIds.has(reference.id)),
          ...draft.references,
        ],
      };
    }, sessionId);
  }

  /** 重开面板时以服务端状态校准发送中的备份。 */
  reconcileSending(sessionId: string, runs: readonly { id: string; status: string }[]) {
    const sending = this.drafts[sessionId]?.sending;
    if (!sending) return;
    const run = runs.find((item) => item.id === sending.runId);
    if (run?.status === 'running') return;
    this.settleSending(sessionId, sending.runId, run?.status === 'completed');
  }
}
