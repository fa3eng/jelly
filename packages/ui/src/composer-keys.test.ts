import { describe, expect, it } from 'vitest';
import { shouldSubmitOnEnter } from './composer-keys';

describe('Chat composer keyboard policy', () => {
  it('sends with Enter', () => {
    expect(
      shouldSubmitOnEnter({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 }),
    ).toBe(true);
  });
  it('keeps Shift+Enter as a newline', () => {
    expect(
      shouldSubmitOnEnter({ key: 'Enter', shiftKey: true, isComposing: false, keyCode: 13 }),
    ).toBe(false);
  });
  it.each([
    { key: 'Enter', shiftKey: false, isComposing: true, keyCode: 13 },
    { key: 'Enter', shiftKey: false, isComposing: false, keyCode: 229 },
  ])('does not submit while confirming an IME candidate: %j', (event) => {
    expect(shouldSubmitOnEnter(event)).toBe(false);
  });
  it('leaves ordinary typing alone', () => {
    expect(
      shouldSubmitOnEnter({ key: 'a', shiftKey: false, isComposing: false, keyCode: 65 }),
    ).toBe(false);
  });
});
