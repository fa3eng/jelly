import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { mountChatPanel } from './react-view';
import type { ServiceConnection } from '../rpc/client';

export const VIEW_TYPE_AULA = 'aula-view';

export class AulaView extends ItemView {
  private unmountChatPanel?: () => void;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly connection: ServiceConnection,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_AULA;
  }

  getDisplayText(): string {
    return 'Aula';
  }

  getIcon(): string {
    return 'book-open';
  }

  async onOpen(): Promise<void> {
    const mountPoint = this.contentEl.createDiv({ cls: 'osc-view-host' });

    this.unmountChatPanel = mountChatPanel(mountPoint, this.connection, this.app);
  }

  async onClose(): Promise<void> {
    this.unmountChatPanel?.();
    this.unmountChatPanel = undefined;
  }
}
