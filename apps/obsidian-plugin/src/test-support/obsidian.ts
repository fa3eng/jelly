/** Obsidian 只发布类型，没有可在测试进程中加载的 JS 入口。 */
export class Component {
  private cleanups: (() => void)[] = [];
  onload() {}
  load() {
    this.onload();
  }
  register(cleanup: () => void) {
    this.cleanups.push(cleanup);
  }
  unload() {
    for (const cleanup of this.cleanups.reverse()) cleanup();
  }
}
export class MarkdownView {}
export class TFile {}
export class Notice {}
export const editorInfoField = {};

export function setIcon(_element: HTMLElement, _name: string) {}
