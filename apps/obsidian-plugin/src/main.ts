import { FileSystemAdapter, Notice, Plugin } from 'obsidian';
import { dirname, join } from 'node:path';
import { JellySettingTab } from './settings/settings-tab';
import {
  API_KEY_SECRET,
  readSettings,
  serviceEnvironment,
  type JellySettings,
} from './settings/config';
import { prepareServiceBundle } from './agent-service/bundle';
import { createUtilityLauncher, getHostUtilityProcess } from './agent-service/utility-process';
import { JellyView, VIEW_TYPE_JELLY } from './chat-view/obsidian-view';
import { startAgentService, type AgentServiceHandle } from './agent-service/process';

declare const __JELLY_AGENT_SERVICE_ENTRY__: string;
declare const __JELLY_AGENT_SERVICE_SOURCE__: string;
declare const __JELLY_NODE_EXECUTABLE__: string;
declare const __JELLY_TSX_LOADER__: string;
declare const __JELLY_DEV__: boolean;
declare const __JELLY_PROJECT_ROOT__: string;

export default class JellyPlugin extends Plugin {
  private agentService?: AgentServiceHandle;
  private serviceChange: Promise<void> = Promise.resolve();
  private unloaded = false;
  settings: JellySettings = readSettings(null);
  serviceStatus = '请先在 Jelly 设置中填写 API Key、API 地址和模型名称。';

  async onload(): Promise<void> {
    this.settings = readSettings(await this.loadData());
    this.addSettingTab(new JellySettingTab(this.app, this));
    this.registerView(
      VIEW_TYPE_JELLY,
      (leaf) =>
        new JellyView(
          leaf,
          () => this.agentService,
          () => this.serviceStatus,
          () => this.openSettings(),
        ),
    );
    this.addCommand({ id: 'open', name: 'Open', callback: () => this.openJellyView() });
    await this.restartService().catch(() => {
      /* Settings remain available after a startup failure. */
    });
  }

  getApiKey(): string {
    return this.app.secretStorage.getSecret(API_KEY_SECRET) ?? '';
  }

  async saveConfiguration(settings: JellySettings, apiKey: string): Promise<void> {
    const environment = serviceEnvironment(settings, apiKey, this.vaultDirectory());
    this.settings = { baseURL: environment.OPENAI_BASE_URL!, model: environment.OPENAI_MODEL! };
    this.app.secretStorage.setSecret(API_KEY_SECRET, environment.OPENAI_API_KEY!);
    await this.saveData(this.settings);
    await this.restartService();
  }

  openSettings(): void {
    const settings = (
      this.app as typeof this.app & {
        setting: { open(): void; openTabById(id: string): void };
      }
    ).setting;
    settings.open();
    settings.openTabById(this.manifest.id);
  }

  private vaultDirectory(): string {
    return (this.app.vault.adapter as FileSystemAdapter).getBasePath();
  }

  private refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_JELLY)) {
      if (leaf.view instanceof JellyView) leaf.view.refresh();
    }
  }

  private restartService(): Promise<void> {
    const operation = this.serviceChange
      .catch(() => {})
      .then(async () => {
        const oldService = this.agentService;
        this.agentService = undefined;
        this.serviceStatus = '正在启动 Agent Service…';
        this.refreshViews();
        await oldService?.stop();
        if (this.unloaded) return;
        const apiKey = this.getApiKey();
        if (!apiKey && !__JELLY_DEV__) {
          this.serviceStatus = '请先在 Jelly 设置中填写 API Key、API 地址和模型名称。';
          this.refreshViews();
          return;
        }
        const pluginDirectory = join(
          this.vaultDirectory(),
          this.manifest.dir ?? join(this.app.vault.configDir, 'plugins', this.manifest.id),
        );
        try {
          const environment = apiKey
            ? serviceEnvironment(this.settings, apiKey, this.vaultDirectory())
            : undefined;
          let service: AgentServiceHandle;
          if (__JELLY_DEV__) {
            service = await startAgentService({
              executable: __JELLY_NODE_EXECUTABLE__,
              args: ['--import', __JELLY_TSX_LOADER__, __JELLY_AGENT_SERVICE_ENTRY__],
              cwd: __JELLY_PROJECT_ROOT__,
              allowedOrigin: 'app://obsidian.md',
              environment,
            });
          } else {
            const entry = await prepareServiceBundle(
              pluginDirectory,
              __JELLY_AGENT_SERVICE_SOURCE__,
            );
            service = await startAgentService({
              launch: createUtilityLauncher(getHostUtilityProcess(entry), entry, dirname(entry)),
              allowedOrigin: 'app://obsidian.md',
              environment,
            });
          }
          if (this.unloaded) {
            await service.stop();
            return;
          }
          this.agentService = service;
          this.serviceStatus = '服务已就绪';
        } catch (error) {
          this.serviceStatus = error instanceof Error ? error.message : '服务启动失败，请检查配置';
          throw error;
        } finally {
          this.refreshViews();
        }
      });
    this.serviceChange = operation;
    return operation;
  }

  async onunload(): Promise<void> {
    this.unloaded = true;
    await this.serviceChange.catch(() => {});
    await this.agentService?.stop();
    this.agentService = undefined;
  }

  async openJellyView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_JELLY)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);

    if (!leaf) {
      new Notice('无法打开学习面板。');
      return;
    }

    await leaf.setViewState({ type: VIEW_TYPE_JELLY, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}
