import { useSyncExternalStore } from 'react';
import { Notice } from 'obsidian';
import { ReferenceAnchor } from '@jelly/ui';
import type { ReferenceDraftStore } from './drafts';
import type { ReferenceSelection } from './selection';

export function ReferenceDrafts({
  store,
  selection,
}: {
  store: ReferenceDraftStore;
  selection: ReferenceSelection;
}) {
  const { draft, error } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <div className="osc-reference-drafts">
      {error && (
        <p role="alert" className="osc-error">
          {error}
        </p>
      )}
      {draft.pending && (
        <div className="osc-reference-pending">
          <span>有一条未完成的提问引用</span>
          <button type="button" onClick={() => selection.resume()}>
            继续编辑
          </button>
          <button type="button" onClick={() => store.cancelPending()}>
            取消引用
          </button>
        </div>
      )}
      {!!draft.references.length && (
        <div
          className="osc-reference-list"
          aria-label={`待发送的提问引用，共 ${draft.references.length} 条`}
        >
          {draft.references.map((reference, index) => (
            <section className="osc-reference-card" key={reference.id}>
              <div className="osc-reference-actions">
                <ReferenceAnchor
                  reference={reference}
                  onOpen={(source) => void selection.openReference(source)}
                />
                <button
                  type="button"
                  className="osc-reference-remove"
                  aria-label={`移除第 ${index + 1} 条引用`}
                  onClick={() => store.remove(reference.id)}
                  title="移除引用"
                >
                  ×
                </button>
              </div>
              <textarea
                aria-label={`第 ${index + 1} 条引用的问题或评论`}
                placeholder="补充问题或评论…"
                rows={1}
                maxLength={4000}
                value={reference.question}
                onChange={(event) => {
                  try {
                    store.edit(reference.id, event.currentTarget.value);
                  } catch (cause) {
                    new Notice(cause instanceof Error ? cause.message : '无法更新引用');
                  }
                }}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
