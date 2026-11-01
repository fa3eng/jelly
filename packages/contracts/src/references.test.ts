import { describe, expect, it } from 'vitest';
import { chatGenerateInputSchema } from './index';

const input = () => ({ sessionId: crypto.randomUUID(), runId: crypto.randomUUID(), prompt: '' });
const reference = () => ({
  id: crypto.randomUUID(),
  path: 'Agent.md',
  text: '资料',
  question: '如何理解？',
  from: { line: 1, ch: 0 },
  to: { line: 1, ch: 2 },
});

describe('提问引用 RPC 校验', () => {
  it('allows reference-only questions while rejecting completely empty requests', () => {
    expect(chatGenerateInputSchema.safeParse(input()).success).toBe(false);
    expect(
      chatGenerateInputSchema.safeParse({ ...input(), references: [reference()] }).success,
    ).toBe(true);
    expect(chatGenerateInputSchema.safeParse({ ...input(), prompt: '普通问题' }).success).toBe(
      true,
    );
  });
  it('rejects invalid ranges and oversized batches', () => {
    const quote = reference();
    expect(
      chatGenerateInputSchema.safeParse({ ...input(), references: [{ ...quote, to: quote.from }] })
        .success,
    ).toBe(false);
    expect(
      chatGenerateInputSchema.safeParse({
        ...input(),
        references: Array.from({ length: 31 }, reference),
      }).success,
    ).toBe(false);
    expect(
      chatGenerateInputSchema.safeParse({
        ...input(),
        references: Array.from({ length: 7 }, () => ({ ...reference(), text: 'a'.repeat(20000) })),
      }).success,
    ).toBe(false);
  });
});
