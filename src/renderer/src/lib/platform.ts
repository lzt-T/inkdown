/** 统一依据 UserAgent 识别当前是否运行在 macOS 桌面环境。 */
export const IS_MAC = navigator.userAgent.includes('Mac')

/** 当前平台的组合键主修饰符标签。 */
export const PRIMARY_MODIFIER = IS_MAC ? '⌘' : 'Ctrl'

/** 将组合键序列格式化为面向当前平台的快捷键提示文本。 */
export function formatShortcut(keys: readonly string[]): string {
  return [PRIMARY_MODIFIER, ...keys].join(IS_MAC ? '' : '+')
}
