import type { QuestionReference } from '@jelly/domain';
import { ChatIcon } from './ChatIcon';

export function referenceLabel(reference: QuestionReference): string {
  const name = reference.path.split('/').at(-1)?.replace(/\.md$/i, '') ?? reference.path;
  const lines =
    reference.from.line === reference.to.line
      ? `L${reference.from.line + 1}`
      : `L${reference.from.line + 1}–${reference.to.line + 1}`;
  return `${name} · ${lines}`;
}

/** 只展示位置锚点；原文保留在数据层，回到笔记查看。 */
export function ReferenceAnchor({
  reference,
  onOpen,
}: {
  reference: QuestionReference;
  onOpen?: (reference: QuestionReference) => void;
}) {
  return (
    <button
      type="button"
      className="osc-reference-anchor"
      title={`返回原文：${reference.path}`}
      onClick={() => onOpen?.(reference)}
    >
      <ChatIcon name="link" size={13} />
      <span>{referenceLabel(reference)}</span>
    </button>
  );
}
