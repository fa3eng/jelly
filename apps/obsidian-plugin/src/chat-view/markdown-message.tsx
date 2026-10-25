import { useEffect, useRef } from 'react';
import { Component, MarkdownRenderer, type App } from 'obsidian';

/**
 * 使用 Obsidian 原生 Markdown 渲染助手回复，保留宿主的代码高亮和内链样式。
 * @param app - 当前 Vault 的 App，由 JellyView 传入。
 * @param content - 完整回复或正在流式增长的 Markdown 文字。
 * @param sourcePath - 相对链接的解析基准，默认从 Vault 根目录解析。
 */
export function MarkdownMessage({
  app,
  content,
  sourcePath = '',
}: {
  app: App;
  content: string;
  sourcePath?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = container.current;
    if (!target) return;
    const parent = new Component();
    const rendered = createDiv({ cls: 'markdown-rendered' });
    let active = true;
    parent.load();
    // 在独立节点渲染，旧请求即使晚完成，也不能覆盖更新后的回复。
    void MarkdownRenderer.render(app, content, rendered, sourcePath, parent)
      .then(() => {
        if (active) target.replaceChildren(rendered);
        else parent.unload();
      })
      .catch(() => {
        if (active) target.textContent = content;
        parent.unload();
      });
    return () => {
      active = false;
      parent.unload();
    };
  }, [app, content, sourcePath]);

  return (
    <div
      ref={container}
      className="osc-markdown"
      onClick={(event) => {
        const link =
          event.target instanceof Element
            ? event.target.closest<HTMLAnchorElement>('a.internal-link')
            : null;
        const href = link?.dataset.href ?? link?.getAttribute('href');
        if (!href) return;
        event.preventDefault();
        void app.workspace.openLinkText(href, sourcePath, event.metaKey || event.ctrlKey);
      }}
    />
  );
}
