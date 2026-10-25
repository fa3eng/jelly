import { PluginSettingTab, Setting, type App } from 'obsidian';
import type JellyPlugin from '../main';

export class JellySettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: JellyPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl('h2', { text: 'Jelly' });
    this.containerEl.createEl('p', {
      text: '填写模型服务后即可使用。Jelly 的文件工具仅操作当前 Vault，会话自动保存在本地。',
    });
    const draft = { ...this.plugin.settings };
    let apiKey = this.plugin.getApiKey();
    new Setting(this.containerEl)
      .setName('API Key')
      .setDesc('保存在 Obsidian 本机钥匙串中，不写入插件配置文件。')
      .addText((input) => {
        input.inputEl.type = 'password';
        input.inputEl.autocomplete = 'off';
        input
          .setPlaceholder('粘贴你的 DeepSeek API Key')
          .setValue(apiKey)
          .onChange((value) => {
            apiKey = value;
          });
      });
    new Setting(this.containerEl)
      .setName('API 地址')
      .setDesc('模型服务的 Base URL。')
      .addText((input) =>
        input
          .setPlaceholder('https://api.deepseek.com')
          .setValue(draft.baseURL)
          .onChange((value) => {
            draft.baseURL = value;
          }),
      );
    new Setting(this.containerEl)
      .setName('模型名称')
      .setDesc('填写服务商提供的模型 ID。')
      .addText((input) =>
        input
          .setPlaceholder('deepseek-flash')
          .setValue(draft.model)
          .onChange((value) => {
            draft.model = value;
          }),
      );
    const status = this.containerEl.createEl('p', {
      text: this.plugin.serviceStatus,
      attr: { role: 'status' },
    });
    new Setting(this.containerEl)
      .addButton((button) =>
        button
          .setButtonText('保存并启动')
          .setCta()
          .onClick(async () => {
            button.setDisabled(true);
            status.setText('正在启动…');
            try {
              await this.plugin.saveConfiguration(draft, apiKey);
              status.setText('服务已就绪，可以打开 Jelly 开始对话。');
            } catch (error) {
              status.setText(error instanceof Error ? error.message : '启动失败，请检查配置后重试');
            } finally {
              button.setDisabled(false);
            }
          }),
      )
      .addButton((button) =>
        button.setButtonText('打开 Jelly').onClick(() => {
          void this.plugin.openJellyView();
        }),
      );
    this.containerEl.createEl('p', {
      text: '对话和使用到的笔记内容会发送给你配置的模型服务，费用由该服务商收取。',
    });
  }
}
