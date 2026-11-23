/** 剥离 Electron IPC 与通用 Error 前缀，提取面向用户的简洁错误描述。 */
export function formatErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
    .replace(/^Error:\s*/i, '')
    .trim()
}
