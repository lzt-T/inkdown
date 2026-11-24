import {
  basename,
  expandLocalImagePaths,
  isInsideDir,
  replacePathPrefix
} from '@/lib/markdown-paths'
import type { OpenDocument } from '@/store/editor-store'
import type { EditorMode, FileNode } from '../../../shared/contracts'

// 与 editor-store 保持一致的富文本保活上限，避免删除激活文档后保活列表越界。
const MAX_MOUNTED_WYSIWYG_TABS = 4

export interface RenameSyncStateSlice {
  mode: EditorMode
  treeNodes: Record<string, FileNode[]>
  expandedDirs: string[]
  openDocs: Record<string, OpenDocument>
  tabOrder: string[]
  recentTabKeys: string[]
  activeKey: string | null
}

/** 递归替换文件夹重命名后缓存节点中的路径前缀。 */
function remapFileNodeList(
  nodes: FileNode[],
  oldPrefix: string,
  newPrefix: string
): FileNode[] {
  return nodes.map((node) => {
    const nextPath = replacePathPrefix(node.path, oldPrefix, newPrefix) ?? node.path
    return {
      ...node,
      path: nextPath,
      ...(node.children ? { children: remapFileNodeList(node.children, oldPrefix, newPrefix) } : {})
    }
  })
}

/** 在应用内重命名文件或目录后，同步迁移已打开文档、标签顺序与文件树缓存路径。 */
export function applyRenamedPathToState(
  state: RenameSyncStateSlice,
  oldPath: string,
  renamedNode: FileNode
): Partial<RenameSyncStateSlice> {
  const normalizedOld = oldPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const keyMap = new Map<string, string>()
  let docsChanged = false
  const nextOpenDocs: Record<string, OpenDocument> = {}

  for (const [key, doc] of Object.entries(state.openDocs)) {
    if (!doc.diskPath) {
      nextOpenDocs[key] = doc
      continue
    }

    if (renamedNode.type === 'file') {
      const normalizedDocPath = doc.diskPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      if (normalizedDocPath !== normalizedOld) {
        nextOpenDocs[key] = doc
        continue
      }
      docsChanged = true
      const nextKey = key.startsWith('untitled:') ? key : renamedNode.path
      if (nextKey !== key) keyMap.set(key, nextKey)
      nextOpenDocs[nextKey] = {
        ...doc,
        key: nextKey,
        diskPath: renamedNode.path,
        name: renamedNode.name,
        isMissingOnDisk: false
      }
      continue
    }

    const nextDiskPath = replacePathPrefix(doc.diskPath, oldPath, renamedNode.path)
    if (!nextDiskPath) {
      nextOpenDocs[key] = doc
      continue
    }
    docsChanged = true
    const nextKey = key.startsWith('untitled:') ? key : nextDiskPath
    if (nextKey !== key) keyMap.set(key, nextKey)
    // 目录名变更会影响相对路径图片的解析基址，按当前激活模式同步或延迟刷新。
    const viewMarkdown =
      state.mode === 'wysiwyg'
        ? expandLocalImagePaths(doc.rawMarkdown, nextDiskPath)
        : doc.viewMarkdown
    nextOpenDocs[nextKey] = {
      ...doc,
      key: nextKey,
      diskPath: nextDiskPath,
      name: basename(nextDiskPath),
      viewMarkdown,
      viewMarkdownStale: state.mode !== 'wysiwyg',
      isMissingOnDisk: false
    }
  }

  let nextTreeNodes = state.treeNodes
  let nextExpandedDirs = state.expandedDirs
  let treeChanged = false

  if (renamedNode.type === 'directory') {
    const remappedTreeNodes: Record<string, FileNode[]> = {}
    for (const [dir, nodes] of Object.entries(state.treeNodes)) {
      const nextDir = replacePathPrefix(dir, oldPath, renamedNode.path)
      if (nextDir) {
        treeChanged = true
        remappedTreeNodes[nextDir] = remapFileNodeList(nodes, oldPath, renamedNode.path)
      } else {
        remappedTreeNodes[dir] = nodes
      }
    }
    if (treeChanged) nextTreeNodes = remappedTreeNodes

    const remappedExpanded = state.expandedDirs.map((dir) => {
      const nextDir = replacePathPrefix(dir, oldPath, renamedNode.path)
      if (nextDir) {
        treeChanged = true
        return nextDir
      }
      return dir
    })
    if (treeChanged) nextExpandedDirs = [...new Set(remappedExpanded)]
  }

  if (!docsChanged && !treeChanged) return state

  const mapKey = (key: string): string => keyMap.get(key) ?? key
  const nextTabOrder = docsChanged ? state.tabOrder.map(mapKey) : state.tabOrder
  const nextRecentTabKeys = docsChanged
    ? [...new Set(state.recentTabKeys.map(mapKey))]
    : state.recentTabKeys
  const nextActiveKey =
    docsChanged && state.activeKey ? mapKey(state.activeKey) : state.activeKey

  return {
    ...(docsChanged
      ? {
          openDocs: nextOpenDocs,
          tabOrder: nextTabOrder,
          recentTabKeys: nextRecentTabKeys,
          activeKey: nextActiveKey
        }
      : {}),
    ...(treeChanged
      ? {
          treeNodes: nextTreeNodes,
          expandedDirs: nextExpandedDirs
        }
      : {})
  }
}

/** 在应用内确认删除文件或目录后，关闭受影响标签页并清理目录缓存与展开态。 */
export function applyDeletedPathToState(
  state: RenameSyncStateSlice,
  targetPath: string,
  type: FileNode['type']
): Partial<RenameSyncStateSlice & { activeHeading: number }> {
  const normalizedTarget = targetPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const removedKeys = new Set<string>()

  for (const [key, doc] of Object.entries(state.openDocs)) {
    if (!doc.diskPath) continue
    if (type === 'file') {
      const normalizedDocPath = doc.diskPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      if (normalizedDocPath === normalizedTarget) removedKeys.add(key)
    } else if (isInsideDir(targetPath, doc.diskPath)) {
      removedKeys.add(key)
    }
  }

  let nextTreeNodes = state.treeNodes
  let nextExpandedDirs = state.expandedDirs
  let treeChanged = false

  if (type === 'directory') {
    const filteredTreeNodes: Record<string, FileNode[]> = {}
    for (const [dir, nodes] of Object.entries(state.treeNodes)) {
      if (isInsideDir(targetPath, dir)) {
        treeChanged = true
      } else {
        filteredTreeNodes[dir] = nodes
      }
    }
    if (treeChanged) nextTreeNodes = filteredTreeNodes

    const filteredExpanded = state.expandedDirs.filter((dir) => !isInsideDir(targetPath, dir))
    if (filteredExpanded.length !== state.expandedDirs.length) {
      treeChanged = true
      nextExpandedDirs = filteredExpanded
    }
  }

  if (removedKeys.size === 0 && !treeChanged) return state

  if (removedKeys.size === 0) {
    return { treeNodes: nextTreeNodes, expandedDirs: nextExpandedDirs }
  }

  const nextOpenDocs: Record<string, OpenDocument> = {}
  for (const [key, doc] of Object.entries(state.openDocs)) {
    if (!removedKeys.has(key)) nextOpenDocs[key] = doc
  }

  const nextTabOrder = state.tabOrder.filter((key) => !removedKeys.has(key))
  let nextActiveKey = state.activeKey
  let activeChanged = false

  if (nextActiveKey && removedKeys.has(nextActiveKey)) {
    activeChanged = true
    const removedIndex = state.tabOrder.indexOf(nextActiveKey)
    let fallbackKey: string | null = null
    // 优先向前寻找未被本次批量删除的最近相邻标签，否则回退到剩余首个标签。
    for (let index = removedIndex - 1; index >= 0; index -= 1) {
      const candidate = state.tabOrder[index]
      if (!removedKeys.has(candidate)) {
        fallbackKey = candidate
        break
      }
    }
    nextActiveKey = fallbackKey ?? nextTabOrder[0] ?? null
  }

  let nextRecentTabKeys = state.recentTabKeys.filter((key) => !removedKeys.has(key))
  if (nextActiveKey) {
    nextRecentTabKeys = [
      nextActiveKey,
      ...nextRecentTabKeys.filter((key) => key !== nextActiveKey)
    ].slice(0, MAX_MOUNTED_WYSIWYG_TABS)
  }

  // 若新激活文档在源码模式编辑过图片路径且当前处于富文本模式，切入前同步展开。
  if (nextActiveKey && state.mode === 'wysiwyg') {
    const nextActiveDoc = nextOpenDocs[nextActiveKey]
    if (nextActiveDoc && nextActiveDoc.viewMarkdownStale) {
      const viewMarkdown = nextActiveDoc.diskPath
        ? expandLocalImagePaths(nextActiveDoc.rawMarkdown, nextActiveDoc.diskPath)
        : nextActiveDoc.rawMarkdown
      nextOpenDocs[nextActiveKey] = {
        ...nextActiveDoc,
        viewMarkdown,
        viewMarkdownStale: false
      }
    }
  }

  return {
    openDocs: nextOpenDocs,
    tabOrder: nextTabOrder,
    recentTabKeys: nextRecentTabKeys,
    activeKey: nextActiveKey,
    ...(activeChanged ? { activeHeading: 0 } : {}),
    ...(treeChanged ? { treeNodes: nextTreeNodes, expandedDirs: nextExpandedDirs } : {})
  }
}
