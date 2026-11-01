import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ReferenceDraftStore } from './drafts';

const quote = () => ({
  id: randomUUID(),
  path: '学习/Agent.md',
  text: '原文快照',
  from: { line: 1, ch: 0 },
  to: { line: 1, ch: 4 },
  question: '',
});

describe('提问引用草稿', () => {
  it('restores per-session prompts, pending edits and references after remount/restart', async () => {
    let saved: unknown;
    const store = new ReferenceDraftStore(undefined, async (data) => {
      saved = data;
    });
    const first = randomUUID();
    const second = randomUUID();
    store.activate(first);
    store.setPrompt('一起解释');
    store.begin(quote());
    store.setPendingQuestion('第一问');
    store.finishPending();
    store.begin(quote());
    store.setPendingQuestion('尚未完成');
    store.activate(second);
    expect(store.getSnapshot().draft.references).toEqual([]);
    store.setPrompt('另一个会话');
    await store.flush();
    const restored = new ReferenceDraftStore(saved, async () => {});
    restored.activate(first);
    expect(restored.getSnapshot().draft).toMatchObject({
      prompt: '一起解释',
      references: [{ question: '第一问' }],
      pending: { question: '尚未完成' },
    });
    restored.activate(second);
    expect(restored.getSnapshot().draft.prompt).toBe('另一个会话');
  });

  it('moves a batch out immediately and restores failures alongside the next draft', () => {
    const store = new ReferenceDraftStore(undefined, async () => {});
    const session = randomUUID();
    const runId = randomUUID();
    store.activate(session);
    const first = quote();
    store.begin(first);
    store.finishPending();
    store.setPrompt('总问题');
    store.startSending(session, runId, '总问题', [first]);
    expect(store.getSnapshot().draft.references).toEqual([]);
    expect(store.getSnapshot().draft.prompt).toBe('');
    const next = quote();
    store.begin(next);
    store.finishPending();
    store.setPrompt('下一个问题');
    store.settleSending(session, runId, false);
    expect(store.getSnapshot().draft.references).toEqual([first, next]);
    expect(store.getSnapshot().draft.prompt).toBe('总问题\n\n下一个问题');
    expect(store.getSnapshot().draft.sending).toBeUndefined();
  });

  it('recovers in-flight snapshots after restart using the persisted run status', async () => {
    let saved: unknown;
    const store = new ReferenceDraftStore(undefined, async (data) => {
      saved = data;
    });
    const session = randomUUID();
    const runId = randomUUID();
    const first = quote();
    store.activate(session);
    store.begin(first);
    store.finishPending();
    store.startSending(session, runId, '', [first]);
    await store.flush();
    const restored = new ReferenceDraftStore(saved, async () => {});
    restored.activate(session);
    restored.reconcileSending(session, [{ id: runId, status: 'running' }]);
    expect(restored.getSnapshot().draft.references).toEqual([]);
    restored.reconcileSending(session, [{ id: runId, status: 'error' }]);
    expect(restored.getSnapshot().draft.references).toEqual([first]);
    const completed = new ReferenceDraftStore(saved, async () => {});
    completed.activate(session);
    completed.reconcileSending(session, [{ id: runId, status: 'completed' }]);
    expect(completed.getSnapshot().draft.references).toEqual([]);
    expect(completed.getSnapshot().draft.sending).toBeUndefined();
  });

  it('does not overwrite an unfinished selection and surfaces disk failures without losing content', async () => {
    const store = new ReferenceDraftStore(undefined, async () => {
      throw new Error('disk full');
    });
    store.activate(randomUUID());
    const pending = quote();
    expect(store.begin(pending)).toBe(true);
    store.setPendingQuestion('草稿');
    expect(store.begin(quote())).toBe(false);
    await store.flush();
    expect(store.getSnapshot().draft.pending?.id).toBe(pending.id);
    expect(store.getSnapshot().draft.pending?.question).toBe('草稿');
    expect(store.getSnapshot().error).toContain('保存失败');
  });

  it('ignores damaged persisted drafts and enforces selection and length limits', () => {
    const invalidId = randomUUID();
    const store = new ReferenceDraftStore(
      { [invalidId]: { references: [{ bad: true }] } },
      async () => {},
    );
    store.activate(invalidId);
    expect(store.getSnapshot().draft.references).toEqual([]);
    expect(() => store.begin({ ...quote(), text: 'x'.repeat(20001) })).toThrow();
    expect(store.getSnapshot().draft.pending).toBeUndefined();
  });
});
