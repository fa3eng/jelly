import {
  Component,
  MarkdownView,
  Notice,
  TFile,
  editorInfoField,
  setIcon,
  type App,
  type Editor,
  type MarkdownFileInfo,
} from 'obsidian';
import { EditorView } from '@codemirror/view';
import type { QuestionReference } from '@jelly/domain';
import { referenceLabel } from '@jelly/ui';
import type { ReferenceDraftStore } from './drafts';

/** 只挂载临时浮层；从不向笔记写入高亮、标记或其他内容。 */
export class ReferenceSelection extends Component {
  private popover?: HTMLElement;
  private timer?: ReturnType<typeof setTimeout>;
  private editing = false;
  private pendingId?: string;
  private pendingSession?: string | null;
  private sourceEditor?: Editor;

  constructor(
    private readonly app: App,
    private readonly drafts: ReferenceDraftStore,
    private readonly openChat: () => Promise<void>,
  ) {
    super();
  }

  onload() {
    this.register(
      this.drafts.subscribe(() => {
        const state = this.drafts.getSnapshot();
        if (
          this.editing &&
          (state.sessionId !== this.pendingSession || state.draft.pending?.id !== this.pendingId)
        ) {
          this.sourceEditor = undefined;
          this.hide();
        }
      }),
    );
    this.register(() => {
      clearTimeout(this.timer);
      this.hide();
    });
  }

  extension() {
    return EditorView.updateListener.of((update) => {
      if (update.viewportChanged && !this.editing) this.hide();
      if (!update.selectionSet && !update.docChanged && !update.focusChanged) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.capture(update.view), 180);
    });
  }

  private capture(view: EditorView) {
    if (this.editing) return;
    if (!view.hasFocus) {
      this.hide();
      return;
    }
    const selection = view.state.selection.main;
    const info = view.state.field(editorInfoField, false);
    if (
      selection.empty ||
      view.state.selection.ranges.length !== 1 ||
      !info?.file ||
      info.file.extension !== 'md' ||
      !info.editor
    ) {
      this.hide();
      return;
    }
    const rect = view.coordsAtPos(selection.to);
    if (!rect) {
      this.hide();
      return;
    }
    const editor = info.editor;
    const text = editor.getSelection();
    if (!text.trim()) {
      this.hide();
      return;
    }
    const reference = this.reference(editor, info, text);
    this.hide();
    const popover = this.createPopover(view.dom.ownerDocument, rect.left, rect.bottom + 6);
    popover.addClass('osc-selection-toolbar');
    popover.setAttribute('role', 'toolbar');
    popover.setAttribute('aria-label', '选中文字的提问方式');
    const direct = popover.createEl('button', {
      cls: 'osc-selection-action',
      attr: {
        'aria-label': '直接提问（暂未接入）',
        title: '直接提问稍后接入：翻译、解释等临时问答',
      },
    });
    setIcon(direct.createEl('span'), 'sparkles');
    direct.createEl('span', { text: '直接提问' });
    direct.disabled = true;
    const sidebar = popover.createEl('button', {
      cls: 'osc-selection-action',
      attr: { 'aria-label': '侧栏提问' },
    });
    setIcon(sidebar.createEl('span'), 'panel-right');
    sidebar.createEl('span', { text: '侧栏提问' });
    sidebar.addEventListener('pointerdown', (event) => event.preventDefault());
    sidebar.addEventListener('click', () => this.begin(reference, editor));
    this.position(popover, rect.left, rect.bottom + 6);
  }

  private reference(editor: Editor, info: MarkdownFileInfo, text: string): QuestionReference {
    return {
      id: crypto.randomUUID(),
      path: info.file!.path,
      text,
      from: { ...editor.getCursor('from') },
      to: { ...editor.getCursor('to') },
      question: '',
    };
  }

  fromEditor(editor: Editor, info: MarkdownFileInfo) {
    const text = editor.getSelection();
    if (!text.trim() || !info.file) return;
    this.begin(this.reference(editor, info, text), editor);
  }

  private begin(reference: QuestionReference, editor: Editor) {
    void (async () => {
      if (!this.drafts.getSnapshot().sessionId) {
        await this.openChat();
        if (!this.drafts.getSnapshot().sessionId) {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              unsubscribe();
              reject(new Error('Jelly 会话尚未就绪，请检查侧边栏中的服务状态。'));
            }, 10_000);
            const unsubscribe = this.drafts.subscribe(() => {
              if (this.drafts.getSnapshot().sessionId) {
                clearTimeout(timeout);
                unsubscribe();
                resolve();
              }
            });
          });
        }
      }
      if (!this.drafts.begin(reference))
        new Notice('你还有一条未完成的提问，请先加入待发送或取消。');
      else this.sourceEditor = editor;
      this.resume();
    })().catch((cause) => new Notice(cause instanceof Error ? cause.message : '无法添加提问引用'));
  }

  resume() {
    const state = this.drafts.getSnapshot();
    const pending = state.draft.pending;
    if (!pending) return;
    const doc = this.popover?.ownerDocument ?? document;
    const rect = this.popover?.getBoundingClientRect();
    this.hide();
    const popover = this.createPopover(doc, rect?.left ?? 80, rect?.top ?? 100);
    this.editing = true;
    this.pendingId = pending.id;
    this.pendingSession = state.sessionId;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', '添加提问引用');
    popover.addClass('osc-reference-editor');
    const anchor = popover.createEl('button', {
      cls: 'osc-reference-anchor',
      attr: { title: `返回原文：${pending.path}` },
    });
    setIcon(anchor.createEl('span'), 'link');
    anchor.createEl('span', { text: referenceLabel(pending) });
    anchor.addEventListener('click', () => {
      this.hide();
      void this.openReference(pending);
    });
    const input = popover.createEl('textarea', {
      attr: {
        'aria-label': '引用的问题或评论',
        placeholder: '写下你的问题或评论…',
        rows: '2',
        maxlength: '4000',
      },
    });
    input.value = pending.question;
    input.addEventListener('input', () => this.drafts.setPendingQuestion(input.value));
    const actions = popover.createDiv({ cls: 'osc-reference-actions' });
    const hint = actions.createEl('span', {
      text: '⌘/Ctrl + Enter',
      cls: 'osc-reference-shortcut',
    });
    hint.setAttribute('aria-hidden', 'true');
    const cancel = actions.createEl('button', { text: '取消', cls: 'osc-reference-cancel' });
    cancel.addEventListener('click', () => {
      this.drafts.cancelPending();
      this.hide();
    });
    const add = actions.createEl('button', { text: '加入侧栏', cls: 'mod-cta' });
    const sourceEditor = this.sourceEditor;
    const finish = () => {
      try {
        this.drafts.finishPending();
        this.hide();
        void this.openChat()
          .then(() => sourceEditor?.focus())
          .catch(() => new Notice('引用已加入草稿，但无法打开 Jelly 侧边栏。'));
      } catch (cause) {
        new Notice(cause instanceof Error ? cause.message : '无法添加引用');
      }
    };
    add.addEventListener('click', finish);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        this.hide();
      }
      if (
        event.key === 'Enter' &&
        (event.metaKey || event.ctrlKey) &&
        !event.isComposing &&
        event.keyCode !== 229
      ) {
        event.preventDefault();
        finish();
      }
    });
    this.position(popover, rect?.left ?? 80, rect?.top ?? 100);
    input.focus();
    const outside = (event: PointerEvent) => {
      if (!event.composedPath().includes(popover)) this.hide();
    };
    doc.addEventListener('pointerdown', outside);
    this.outsideCleanup = () => doc.removeEventListener('pointerdown', outside);
  }

  private outsideCleanup?: () => void;
  private createPopover(doc: Document, x: number, y: number) {
    const popover = doc.body.createDiv({ cls: 'osc-reference-popover' });
    this.popover = popover;
    this.position(popover, x, y);
    return popover;
  }
  private position(popover: HTMLElement, x: number, y: number) {
    const win = popover.ownerDocument.defaultView!;
    const rect = popover.getBoundingClientRect();
    popover.style.left = `${Math.max(8, Math.min(x, win.innerWidth - rect.width - 8))}px`;
    popover.style.top = `${Math.max(8, Math.min(y, win.innerHeight - rect.height - 8))}px`;
  }
  private hide() {
    this.outsideCleanup?.();
    this.outsideCleanup = undefined;
    this.popover?.remove();
    this.popover = undefined;
    this.editing = false;
  }

  async openReference(reference: QuestionReference) {
    const file = this.app.vault.getAbstractFileByPath(reference.path);
    if (!(file instanceof TFile)) {
      new Notice('引用的笔记已移动或删除，聊天中仍保留原文。');
      return;
    }
    // 不复用当前活跃的 Jelly 侧栏，否则打开原文会把聊天面板替换掉。
    const leaf =
      this.app.workspace
        .getLeavesOfType('markdown')
        .find(
          (candidate) =>
            candidate.view instanceof MarkdownView && candidate.view.file?.path === reference.path,
        ) ?? this.app.workspace.getLeaf('tab');
    await leaf.openFile(file, { eState: { line: reference.from.line } });
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof MarkdownView && leaf.view.getMode() === 'source') {
      const editor = leaf.view.editor;
      if (
        reference.to.line <= editor.lastLine() &&
        editor.getRange(reference.from, reference.to) === reference.text
      )
        editor.setSelection(reference.from, reference.to);
      else {
        editor.setCursor(Math.min(reference.from.line, editor.lastLine()), 0);
        new Notice('原文已变化，已打开引用笔记；快照仍保留在聊天中。');
      }
      editor.focus();
    }
  }
}
