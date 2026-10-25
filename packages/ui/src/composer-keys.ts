interface ComposerKey {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  keyCode: number;
}

/**
 * 判断按键是否意图发送；由 ChatPanel 的 keydown 处理器调用。
 * @param event - 按键与输入法状态，229 兼容输入法确认期间的浏览器事件。
 * @returns 普通 Enter 返回 true；Shift+Enter 和输入法确认保留原行为。
 */
export function shouldSubmitOnEnter(event: ComposerKey): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}
