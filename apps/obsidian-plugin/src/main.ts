import { FileSystemAdapter, Notice, Plugin } from 'obsidian';
import { dirname, join } from 'node:path';
import { AulaView, VIEW_TYPE_AULA } from './chat-view/obsidian-view';
import { startAgentService, type AgentServiceHandle } from './agent-service/process';

declare const __AULA_AGENT_SERVICE_ENTRY__: string;
declare const __AULA_NODE_EXECUTABLE__: string;
declare const __AULA_TSX_LOADER__: string;
declare const __AULA_DEV__: boolean;
declare const __AULA_PROJECT_ROOT__: string;

export default class AulaPlugin extends Plugin {
  private agentService?: AgentServiceHandle;

  async onload(): Promise<void> {
    const serviceEntry = __AULA_DEV__
      ? __AULA_AGENT_SERVICE_ENTRY__
      : join(
          (this.app.vault.adapter as FileSystemAdapter).getBasePath(),
          this.manifest.dir ?? join('.obsidian', 'plugins', this.manifest.id),
          'agent-service.mjs',
        );
    this.agentService = await startAgentService({
      executable: __AULA_NODE_EXECUTABLE__,
      args: __AULA_DEV__ ? ['--import', __AULA_TSX_LOADER__, serviceEntry] : [serviceEntry],
      // Resolve the optional .env from a predictable location in either mode.
      cwd: __AULA_DEV__ ? __AULA_PROJECT_ROOT__ : dirname(serviceEntry),
      allowedOrigin: 'app://obsidian.md',
    });

    const service = this.agentService;
    if (!service) {
      throw new Error('Agent servevice 尚未就绪');
    }

    this.registerView(VIEW_TYPE_AULA, (leaf) => new AulaView(leaf, service));

    this.addCommand({
      id: 'open-aula',
      name: 'Open Aula',
      callback: () => this.openAulaView(),
    });
  }

  async onunload(): Promise<void> {
    await this.agentService?.stop();
    this.agentService = undefined;
  }

  private async openAulaView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_AULA)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);

    if (!leaf) {
      new Notice('无法打开学习面板。');
      return;
    }

    await leaf.setViewState({ type: VIEW_TYPE_AULA, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}
