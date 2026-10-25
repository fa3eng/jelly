import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { mountChatPanel } from './react-view';
import type { ServiceConnection } from '../rpc/client';

export const VIEW_TYPE_JELLY = 'jelly-view';

export class JellyView extends ItemView {
  private unmountChatPanel?: () => void;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly getConnection: () => ServiceConnection | undefined,
    private readonly getStatus: () => string,
    private readonly openSettings: () => void,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_JELLY;
  }

  getDisplayText(): string {
    return 'Jelly';
  }

  getIcon(): string {
    return 'book-open';
  }

  async onOpen(): Promise<void> {
    this.refresh();
  }

  refresh(): void {
    this.unmountChatPanel?.();
    this.unmountChatPanel = undefined;
    this.contentEl.empty();
    const connection = this.getConnection();
    if (!connection) {
      this.contentEl.createEl('p', { text: this.getStatus(), attr: { role: 'status' } });
      const button = this.contentEl.createEl('button', { text: '打开 Jelly 设置' });
      button.addEventListener('click', this.openSettings);
      return;
    }
    const mountPoint = this.contentEl.createDiv({ cls: 'osc-view-host' });
    this.unmountChatPanel = mountChatPanel(mountPoint, connection, this.app);
  }

  async onClose(): Promise<void> {
    this.unmountChatPanel?.();
    this.unmountChatPanel = undefined;
  }
}
