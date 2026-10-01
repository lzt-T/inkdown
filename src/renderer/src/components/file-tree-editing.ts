import type { FileNode } from '../../../shared/contracts'

export type EditingState =
  | {
      kind: 'rename'
      path: string
      value: string
      parent: string
      depth: number
      nodeType: FileNode['type']
    }
  | {
      kind: 'create-file'
      parent: string
      value: string
      depth: number
      openAfterCreate?: boolean
      shouldFocus?: boolean
    }
  | { kind: 'create-folder'; parent: string; value: string; depth: number }

// 新建类型映射到文案键，创建操作发生时才解析当前语言。
export const CREATE_DEFAULT_NAMES: Record<'create-file' | 'create-folder', string> = {
  'create-file': 'workspace.untitled-md',
  'create-folder': 'workspace.new-folder'
}

/** 返回目录中尚未占用的默认名称。 */
export function getAvailableName(defaultName: string, nodes: FileNode[]): string {
  // 已有名称集合用于在临时节点出现前确定编号。
  const existingNames = new Set(nodes.map((node) => node.name))
  if (!existingNames.has(defaultName)) return defaultName
  // 扩展名位置用于保证 Markdown 编号位于 .md 之前。
  const extensionIndex = defaultName.lastIndexOf('.')
  // 仅文件默认名包含需要保留的扩展名。
  const hasExtension = extensionIndex > 0
  // 默认名称主体承载递增编号。
  const stem = hasExtension ? defaultName.slice(0, extensionIndex) : defaultName
  // 文件扩展名在编号后保持不变。
  const extension = hasExtension ? defaultName.slice(extensionIndex) : ''
  // 编号从 1 开始匹配现有文件系统命名规则。
  let index = 1
  while (existingNames.has(`${stem} ${index}${extension}`)) index += 1
  return `${stem} ${index}${extension}`
}
