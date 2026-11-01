// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, Editor, MarkdownFileInfo } from 'obsidian';
import { ReferenceSelection } from './selection';
import { ReferenceDraftStore } from './drafts';

vi.mock('@codemirror/view', () => ({
  EditorView: { updateListener: { of: (listener: unknown) => listener } },
}));

function installDomHelpers() {
  Object.defineProperty(HTMLElement.prototype, 'createEl', {
    configurable: true,
    value: function (
      this: HTMLElement,
      tag: string,
      options: { text?: string; cls?: string; attr?: Record<string, string> } = {},
    ) {
      const child = this.ownerDocument.createElement(tag);
      child.textContent = options.text ?? '';
      child.className = options.cls ?? '';
      for (const [key, value] of Object.entries(options.attr ?? {})) child.setAttribute(key, value);
      this.appendChild(child);
      return child;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'createDiv', {
    configurable: true,
    value: function (this: HTMLElement, options: object) {
      return this.createEl('div', options);
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'addClass', {
    configurable: true,
    value: function (this: HTMLElement, name: string) {
      this.classList.add(name);
    },
  });
}
const editor = {
  focus: vi.fn(),
  getSelection: () => '<b>原文不是 HTML</b>',
  getCursor: (side: string) => ({ line: 0, ch: side === 'from' ? 0 : 17 }),
} as unknown as Editor;
const info = { file: { path: 'Agent.md', extension: 'md' }, editor } as unknown as MarkdownFileInfo;
const input = () => document.querySelector<HTMLTextAreaElement>('[aria-label="引用的问题或评论"]')!;

describe('选区提问浮层', () => {
  let store: ReferenceDraftStore;
  let selection: ReferenceSelection;
  beforeEach(() => {
    installDomHelpers();
    store = new ReferenceDraftStore(undefined, async () => {});
    store.activate(crypto.randomUUID());
    selection = new ReferenceSelection({} as App, store, async () => {});
    selection.load();
  });
  afterEach(() => {
    selection.unload();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('separates quick and sidebar actions and opens a compact anchored composer', async () => {
    vi.useFakeTimers();
    const listener = selection.extension() as unknown as (update: object) => void;
    listener({
      selectionSet: true,
      view: {
        hasFocus: true,
        state: { selection: { main: { empty: false, to: 17 }, ranges: [{}] }, field: () => info },
        coordsAtPos: () => ({ left: 100, bottom: 100 }),
        dom: document.createElement('div'),
      },
    });
    await vi.advanceTimersByTimeAsync(180);
    const toolbar = document.querySelector('[aria-label="侧栏提问"]') as HTMLButtonElement;
    expect(toolbar.textContent).toBe('侧栏提问');
    expect(
      document.querySelector<HTMLButtonElement>('[aria-label="直接提问（暂未接入）"]')?.disabled,
    ).toBe(true);
    toolbar.click();
    expect(document.activeElement).toBe(input());
    expect(document.querySelector('blockquote')).toBeNull();
    expect(document.querySelector('.osc-reference-anchor')?.textContent).toBe('Agent · L1');
    expect(document.querySelector('.osc-reference-popover')?.textContent).not.toContain('原文不是');
  });

  it('retains unfinished input on outside click, resumes it, and only commits on explicit action', () => {
    selection.fromEditor(editor, info);
    input().value = '用 TypeScript 举例';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(input()).toBeNull();
    expect(store.getSnapshot().draft.pending?.question).toBe('用 TypeScript 举例');
    expect(store.getSnapshot().draft.references).toHaveLength(0);
    selection.resume();
    expect(input().value).toBe('用 TypeScript 举例');
    input().dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        isComposing: true,
        bubbles: true,
      }),
    );
    expect(store.getSnapshot().draft.references).toHaveLength(0);
    input().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
    );
    expect(store.getSnapshot().draft.references).toHaveLength(1);
    expect(store.getSnapshot().draft.pending).toBeUndefined();
    expect(input()).toBeNull();
  });

  it('dismisses the previous session editor without overwriting either session', () => {
    const first = store.getSnapshot().sessionId!;
    selection.fromEditor(editor, info);
    input().value = '会话一的问题';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    store.activate(crypto.randomUUID());
    expect(input()).toBeNull();
    expect(store.getSnapshot().draft.pending).toBeUndefined();
    store.activate(first);
    selection.resume();
    expect(input().value).toBe('会话一的问题');
  });
});
