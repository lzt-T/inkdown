import { t } from '@/lib/i18n'
import { create } from 'zustand'
import { toast } from 'sonner'
import { formatErrorMessage } from '@/lib/error-message'
import type {
  EditorMode,
  FileNode,
  OpenFileData,
  RecentState,
  ThemeMode
} from '../../../shared/contracts'
import {
  collapseInkdownImagePaths,
  expandLocalImagePaths,
  isInsideDir,
  basename,
  dirname
} from '@/lib/markdown-paths'
import { applyDeletedPathToState, applyRenamedPathToState } from '@/store/rename-sync'
import {
  captureCurrentModePosition,
  type ModeSyncTarget
} from '@/lib/editor-position-sync'

export interface OpenDocument {
  key: string
  diskPath: string | null
  name: string
  rawMarkdown: string
  viewMarkdown: string
  // 源码模式编辑期间延迟展开图片路径，切回富文本视图时再按需同步。
  viewMarkdownStale: boolean
  savedRawMarkdown: string
  newline: '\r\n' | '\n'
  hasBom: boolean
  saving: boolean
  isMissingOnDisk: boolean
}

// 保活最近访问的富文本标签实例上限，在零重建切页与内存占用之间取得平衡。
const MAX_MOUNTED_WYSIWYG_TABS = 4

type SidebarView = 'files' | 'outline'
type RecentEntryKind = 'file' | 'workspace'

interface EditorStore {
  workspaceRoot: string | null
  treeNodes: Record<string, FileNode[]>
  expandedDirs: string[]
  openDocs: Record<string, OpenDocument>
  tabOrder: string[]
  recentTabKeys: string[]
  activeKey: string | null
  mode: EditorMode
  theme: ThemeMode
  sidebarOpen: boolean
  sidebarView: SidebarView
  recent: RecentState
  activeHeading: number
  headingTarget: { index: number; nonce: number } | null
  modeSyncTarget: ModeSyncTarget | null

  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  setMode: (mode: EditorMode) => void
  toggleMode: () => void
  toggleSidebar: () => void
  setSidebarView: (view: SidebarView) => void
  toggleOutline: () => void
  setRecent: (recent: RecentState) => void
  setActiveHeading: (index: number) => void
  scrollToHeading: (index: number) => void
  consumeHeadingTarget: () => void
  consumeModeSyncTarget: () => void

  openWorkspace: () => Promise<void>
  openWorkspacePath: (path: string) => Promise<void>
  setWorkspace: (root: string, nodes: FileNode[]) => void
  closeWorkspace: () => void
  collapseAllDirectories: () => void
  removeRecentEntry: (kind: RecentEntryKind, path: string) => Promise<void>
  restoreMissingDocument: (key: string) => Promise<boolean>
  setTreeNodes: (directory: string, nodes: FileNode[]) => void
  expandDirectory: (directory: string) => Promise<void>
  collapseDirectory: (directory: string) => void
  refreshDirectory: (directory: string) => Promise<void>
  applyRenamedPath: (oldPath: string, renamedNode: FileNode) => void
  applyDeletedPath: (targetPath: string, type: FileNode['type']) => void
  handleWorkspaceChange: (directory: string) => Promise<void>
  handleFileChange: (filePath: string) => Promise<void>

  openFileDialog: () => Promise<void>
  openPath: (path: string) => Promise<void>
  openData: (data: OpenFileData) => void
  revealFileInWorkspace: (path: string) => Promise<void>
  newUntitled: () => void
  activateTab: (key: string) => void
  closeTab: (key: string) => void
  updateDocumentMarkdown: (key: string, viewMarkdown: string) => void
  updateActiveMarkdown: (viewMarkdown: string) => void
  updateActiveRawMarkdown: (rawMarkdown: string) => void
  saveDocument: (key: string, promptForMissingFile?: boolean) => Promise<boolean>
  saveActive: () => Promise<boolean>
  saveActiveAs: () => Promise<boolean>
  setSaving: (key: string, saving: boolean) => void
}

function makeDocumentKey(diskPath: string): string {
  return diskPath
}

function dataToDocument(data: OpenFileData): OpenDocument {
  const viewMarkdown = expandLocalImagePaths(data.content, data.path)
  return {
    key: makeDocumentKey(data.path),
    diskPath: data.path,
    name: data.name,
    rawMarkdown: data.content,
    viewMarkdown,
    viewMarkdownStale: false,
    savedRawMarkdown: data.content,
    newline: data.newline,
    hasBom: data.hasBom,
    saving: false,
    isMissingOnDisk: false
  }
}

/** 使用创建时的界面语言生成未保存文档名称。 */
function untitledDocument(): OpenDocument {
  const id = crypto.randomUUID()
  return {
    key: `untitled:${id}`,
    diskPath: null,
    name: t('workspace.untitled-md'),
    rawMarkdown: '',
    viewMarkdown: '',
    viewMarkdownStale: false,
    savedRawMarkdown: '',
    newline: '\n',
    hasBom: false,
    saving: false,
    isMissingOnDisk: false
  }
}

/** 判断 IPC 错误是否表示磁盘路径已经不存在。 */
function isMissingPathError(error: unknown): boolean {
  return String(error).includes('ENOENT')
}

/** 移除指定最近路径，并返回主进程持久化后的最近状态。 */
async function persistRecentPathRemoval(
  recent: RecentState,
  kind: RecentEntryKind,
  path: string
): Promise<RecentState> {
  // 下一份最近状态仅修改目标类型对应的路径集合。
  const nextRecent: RecentState =
    kind === 'file'
      ? { ...recent, files: recent.files.filter((item) => item !== path) }
      : {
          ...recent,
          workspaces: recent.workspaces.filter((item) => item !== path),
          lastWorkspace: recent.lastWorkspace === path ? null : recent.lastWorkspace
        }
  // 主进程返回值作为界面与磁盘共同采用的最新状态。
  const persistedState = await window.api.settings.set({ recent: nextRecent })
  return persistedState.recent
}

/** 将最近激活的标签键移至队首并限制保活数量。 */
function touchRecentTab(recentTabKeys: string[], key: string): string[] {
  return [key, ...recentTabKeys.filter((item) => item !== key)].slice(0, MAX_MOUNTED_WYSIWYG_TABS)
}

/** 在进入所见即所得视图前按需同步文档的本地图片展开内容。 */
function syncDocViewMarkdown(doc: OpenDocument): OpenDocument {
  if (!doc.viewMarkdownStale) return doc
  const viewMarkdown = doc.diskPath
    ? expandLocalImagePaths(doc.rawMarkdown, doc.diskPath)
    : doc.rawMarkdown
  return { ...doc, viewMarkdown, viewMarkdownStale: false }
}

/** 从磁盘读取并同步单个未修改的已打开文档，若已删除则标记缺失状态。 */
async function reloadOpenDocument(
  doc: OpenDocument,
  set: (partial: (state: EditorStore) => EditorStore | Partial<EditorStore>) => void
): Promise<void> {
  if (!doc.diskPath) return
  const expectedPath = doc.diskPath
  const expectedRawMarkdown = doc.rawMarkdown
  const expectedSavedRawMarkdown = doc.savedRawMarkdown
  try {
    const data = await window.api.file.read(expectedPath)
    if (expectedRawMarkdown !== expectedSavedRawMarkdown) return
    const next = dataToDocument(data)
    set((state) => {
      const current = state.openDocs[doc.key]
      if (
        !current ||
        current.diskPath !== expectedPath ||
        current.rawMarkdown !== expectedRawMarkdown ||
        current.savedRawMarkdown !== expectedSavedRawMarkdown
      ) {
        return state
      }
      if (
        !current.isMissingOnDisk &&
        next.rawMarkdown === current.rawMarkdown &&
        next.newline === current.newline &&
        next.hasBom === current.hasBom
      ) {
        return state
      }
      return {
        openDocs: {
          ...state.openDocs,
          [doc.key]: { ...next, key: current.key, saving: current.saving }
        }
      }
    })
  } catch (error) {
    if (!isMissingPathError(error)) return
    set((state) => {
      // 当前文档可能已在读取期间另存到其他路径。
      const current = state.openDocs[doc.key]
      if (!current || current.diskPath !== expectedPath || current.isMissingOnDisk) return state
      return {
        openDocs: {
          ...state.openDocs,
          [doc.key]: { ...current, saving: false, isMissingOnDisk: true }
        }
      }
    })
  }
}

/** 统一文件树缓存键的路径分隔符。 */
function normalizeTreePath(directory: string): string {
  return directory.replace(/\\/g, '/')
}

/** 替换目录节点并淘汰已经移除的子目录缓存。 */
function updateTreeCache(
  state: Pick<EditorStore, 'treeNodes' | 'expandedDirs'>,
  directory: string,
  nodes: FileNode[]
): Pick<EditorStore, 'treeNodes' | 'expandedDirs'> {
  // 标准化目录用于匹配不同进程返回的路径分隔符。
  const normalizedDirectory = normalizeTreePath(directory)
  // 现有键保持文件树节点最初使用的路径格式。
  const treeDirectory = Object.keys(state.treeNodes).find(
    (cachedDirectory) => normalizeTreePath(cachedDirectory) === normalizedDirectory
  ) ?? directory
  // 当前直接子目录用于判断旧节点是否已经从磁盘移除。
  const currentDirectories = new Set(
    nodes.filter((node) => node.type === 'directory').map((node) => normalizeTreePath(node.path))
  )
  // 消失的直接子目录限定本次需要淘汰的缓存范围。
  const removedDirectories = (state.treeNodes[treeDirectory] ?? [])
    .filter((node) => node.type === 'directory' && !currentDirectories.has(normalizeTreePath(node.path)))
    .map((node) => node.path)
  // 新缓存先复制现有目录，再删除消失目录及其全部后代。
  const treeNodes = { ...state.treeNodes }
  for (const cachedDirectory of Object.keys(treeNodes)) {
    if (removedDirectories.some((removedDirectory) => isInsideDir(removedDirectory, cachedDirectory))) {
      delete treeNodes[cachedDirectory]
    }
  }
  treeNodes[treeDirectory] = nodes
  return {
    treeNodes,
    expandedDirs: state.expandedDirs.filter(
      (expandedDirectory) =>
        !removedDirectories.some((removedDirectory) =>
          isInsideDir(removedDirectory, expandedDirectory)
        )
    )
  }
}

const storedTheme = (localStorage.getItem('inkdown.theme') as ThemeMode | null) ?? 'light'
// 新版页签键区分迁移后的状态与旧版双面板状态。
const storedSidebarViewValue = localStorage.getItem('inkdown.sidebar-view')
// 合法的新版页签值用于恢复侧栏最后一次选择。
const storedSidebarView =
  storedSidebarViewValue === 'files' || storedSidebarViewValue === 'outline'
    ? storedSidebarViewValue
    : null
// 仅在用户明确保存过侧栏状态时恢复，首次冷启动默认收起侧栏保持写作区纯净。
const storedSidebarRaw = localStorage.getItem('inkdown.sidebar')
const storedSidebarOpen = storedSidebarRaw === '1'
// 旧版大纲开关仅在首次迁移时作为参考。
const storedOutlineOpen = localStorage.getItem('inkdown.outline') === '1'
const documentSaveQueues = new Map<string, Promise<boolean>>()

/** 持久化侧栏开关、当前页签及旧版大纲兼容状态。 */
function persistSidebarState(sidebarOpen: boolean, sidebarView: SidebarView): void {
  localStorage.setItem('inkdown.sidebar', sidebarOpen ? '1' : '0')
  localStorage.setItem('inkdown.outline', sidebarOpen && sidebarView === 'outline' ? '1' : '0')
  localStorage.setItem('inkdown.sidebar-view', sidebarView)
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  workspaceRoot: null,
  treeNodes: {},
  expandedDirs: [],
  openDocs: {},
  tabOrder: [],
  recentTabKeys: [],
  activeKey: null,
  mode: 'wysiwyg',
  theme: storedTheme,
  sidebarOpen: storedSidebarRaw !== null ? storedSidebarOpen : storedOutlineOpen,
  sidebarView: storedSidebarView ?? (storedOutlineOpen ? 'outline' : 'files'),
  recent: { workspaces: [], files: [], lastWorkspace: null },
  activeHeading: 0,
  headingTarget: null,
  modeSyncTarget: null,

  setTheme: (theme) => {
    localStorage.setItem('inkdown.theme', theme)
    set({ theme })
  },
  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    get().setTheme(next)
  },
  /** 切换编辑模式，并在切出前采集当前视图位置以供目标编辑器双向对齐。 */
  setMode: (mode) => {
    const current = get()
    if (current.mode === mode) return

    const anchor =
      current.activeKey && current.openDocs[current.activeKey]
        ? captureCurrentModePosition(current.mode, current.activeKey)
        : null
    const modeSyncTarget: ModeSyncTarget | null =
      anchor && current.activeKey
        ? { docKey: current.activeKey, targetMode: mode, anchor, nonce: Date.now() }
        : null

    set((state) => {
      if (mode !== 'wysiwyg' || !state.activeKey) return { mode, modeSyncTarget }
      const doc = state.openDocs[state.activeKey]
      if (!doc || !doc.viewMarkdownStale) return { mode, modeSyncTarget }
      return {
        mode,
        modeSyncTarget,
        openDocs: { ...state.openDocs, [state.activeKey]: syncDocViewMarkdown(doc) }
      }
    })
  },
  toggleMode: () => {
    const nextMode = get().mode === 'wysiwyg' ? 'source' : 'wysiwyg'
    get().setMode(nextMode)
  },
  toggleSidebar: () => {
    // 当前页签在侧栏开关过程中保持不变。
    const { sidebarOpen, sidebarView } = get()
    // 新开关状态直接取反当前侧栏可见性。
    const nextSidebarOpen = !sidebarOpen
    persistSidebarState(nextSidebarOpen, sidebarView)
    set({ sidebarOpen: nextSidebarOpen })
  },
  setSidebarView: (sidebarView) => {
    persistSidebarState(true, sidebarView)
    set({ sidebarOpen: true, sidebarView })
  },
  toggleOutline: () => {
    // 已打开的大纲再次触发时关闭侧栏，其他状态则直接显示大纲。
    const { sidebarOpen, sidebarView } = get()
    // 大纲处于当前可见页签时才执行关闭。
    const nextSidebarOpen = !(sidebarOpen && sidebarView === 'outline')
    persistSidebarState(nextSidebarOpen, 'outline')
    set({ sidebarOpen: nextSidebarOpen, sidebarView: 'outline' })
  },
  setRecent: (recent) => set({ recent }),
  setActiveHeading: (activeHeading) => {
    if (get().activeHeading !== activeHeading) set({ activeHeading })
  },
  scrollToHeading: (index) => set({ headingTarget: { index, nonce: Date.now() } }),
  consumeHeadingTarget: () => set({ headingTarget: null }),
  consumeModeSyncTarget: () => set({ modeSyncTarget: null }),

  /** 按路径打开工作区，并清理已经失效的最近工作区记录。 */
  openWorkspacePath: async (path) => {
    try {
      // 工作区快照用于初始化根目录及首层文件树。
      const snapshot = await window.api.workspace.openPath(path)
      if (!snapshot) return
      persistSidebarState(true, 'files')
      set({
        workspaceRoot: snapshot.root,
        treeNodes: { [snapshot.root]: snapshot.nodes },
        expandedDirs: [snapshot.root],
        sidebarOpen: true,
        sidebarView: 'files'
      })
    } catch (error) {
      if (!isMissingPathError(error)) {
        toast.error(t('workspace.unable-to-open-folder'), { description: formatErrorMessage(error) })
        return
      }
      // 持久化结果用于刷新最近工作区并停止后续启动恢复。
      const recent = await persistRecentPathRemoval(get().recent, 'workspace', path)
      get().setRecent(recent)
      toast.warning(t('workspace.folder-no-longer-exists'), { description: t('workspace.removed-from-recent-items') })
    }
  },
  openWorkspace: async () => {
    const snapshot = await window.api.workspace.open()
    if (!snapshot) return
    persistSidebarState(true, 'files')
    set({
      workspaceRoot: snapshot.root,
      treeNodes: { [snapshot.root]: snapshot.nodes },
      expandedDirs: [snapshot.root],
      sidebarOpen: true,
      sidebarView: 'files'
    })
  },
  setWorkspace: (root, nodes) => {
    persistSidebarState(true, 'files')
    set({
      workspaceRoot: root,
      treeNodes: { [root]: nodes },
      expandedDirs: [root],
      sidebarOpen: true,
      sidebarView: 'files'
    })
  },
  closeWorkspace: () => set({ workspaceRoot: null, treeNodes: {}, expandedDirs: [] }),
  collapseAllDirectories: () => {
    const root = get().workspaceRoot
    set({ expandedDirs: root ? [root] : [] })
  },
  removeRecentEntry: async (kind, path) => {
    const recent = await persistRecentPathRemoval(get().recent, kind, path)
    get().setRecent(recent)
  },
  restoreMissingDocument: async (key) => {
    const doc = get().openDocs[key]
    if (!doc) return false
    if (!doc.diskPath) return get().saveActiveAs()

    const diskPath = doc.diskPath
    get().setSaving(key, true)
    try {
      const result = await window.api.file.save({
        path: diskPath,
        content: doc.rawMarkdown,
        newline: doc.newline,
        hasBom: doc.hasBom
      })
      set((state) => {
        const current = state.openDocs[key]
        if (!current || current.diskPath !== diskPath) return state
        return {
          openDocs: {
            ...state.openDocs,
            [key]: {
              ...current,
              diskPath: result.path,
              name: basename(result.path),
              savedRawMarkdown: doc.rawMarkdown,
              saving: false,
              isMissingOnDisk: false
            }
          }
        }
      })
      await get()
        .refreshDirectory(dirname(result.path))
        .catch(() => undefined)
      toast.success(t('workspace.saved'))
      return true
    } catch (error) {
      get().setSaving(key, false)
      if (isMissingPathError(error) && get().activeKey === key) {
        return get().saveActiveAs()
      }
      toast.error(t('workspace.save-failed'), { description: formatErrorMessage(error) })
      return false
    }
  },
  setTreeNodes: (directory, nodes) => {
    set((state) => updateTreeCache(state, directory, nodes))
  },
  expandDirectory: async (directory) => {
    const nodes = await window.api.workspace.scan(directory)
    get().setTreeNodes(directory, nodes)
    set((state) => ({ expandedDirs: [...new Set([...state.expandedDirs, directory])] }))
  },
  collapseDirectory: (directory) => {
    set((state) => ({ expandedDirs: state.expandedDirs.filter((item) => item !== directory) }))
  },
  refreshDirectory: async (directory) => {
    const nodes = await window.api.workspace.scan(directory)
    get().setTreeNodes(directory, nodes)
  },
  /** 重命名文件或目录后同步迁移内存中的标签路径与文件树缓存。 */
  applyRenamedPath: (oldPath, renamedNode) => {
    set((state) => applyRenamedPathToState(state, oldPath, renamedNode))
  },
  /** 应用内确认删除文件或目录后，关闭受影响标签页并清理目录缓存。 */
  applyDeletedPath: (targetPath, type) => {
    set((state) => applyDeletedPathToState(state, targetPath, type))
  },
  /** 从磁盘重载单个未脏改的已打开文档，文件缺失时标记为磁盘缺失。 */
  handleFileChange: async (filePath) => {
    const normalizedTarget = normalizeTreePath(filePath).toLowerCase()
    const matchingDocs = Object.values(get().openDocs).filter(
      (doc) => doc.diskPath && normalizeTreePath(doc.diskPath).toLowerCase() === normalizedTarget
    )
    if (matchingDocs.length === 0) return
    await Promise.allSettled(
      matchingDocs.map((doc) => reloadOpenDocument(doc, set))
    )
  },
  handleWorkspaceChange: async (directory) => {
    const normalizedDirectory = normalizeTreePath(directory).toLowerCase()
    const hasCachedDirectory = Object.keys(get().treeNodes).some(
      (cachedDir) => normalizeTreePath(cachedDir).toLowerCase() === normalizedDirectory
    )
    if (hasCachedDirectory) {
      await get().refreshDirectory(directory)
    }
    const candidates = Object.values(get().openDocs).filter(
      (doc) => doc.diskPath && isInsideDir(directory, doc.diskPath)
    )
    if (candidates.length === 0) return
    await Promise.allSettled(
      candidates.map((doc) => reloadOpenDocument(doc, set))
    )
  },

  /** 打开选择的文档，并同步其文件树位置。 */
  openFileDialog: async () => {
    // 取消选择时不改变文档或目录上下文。
    const data = await window.api.file.open()
    if (!data) return
    get().openData(data)
    await get().revealFileInWorkspace(data.path)
  },
  /** 按路径打开文件，并清理已经失效的最近文件记录。 */
  openPath: async (path) => {
    try {
      // 文件数据仅在路径成功读取后交给编辑器打开。
      const data = await window.api.file.openPath(path)
      get().openData(data)
      await get().revealFileInWorkspace(data.path)
    } catch (error) {
      if (!isMissingPathError(error)) {
        toast.error(t('workspace.unable-to-open-file'), { description: formatErrorMessage(error) })
        return
      }
      // 持久化结果用于立即刷新欢迎页中的最近文件。
      const recent = await persistRecentPathRemoval(get().recent, 'file', path)
      get().setRecent(recent)
      toast.warning(t('workspace.file-no-longer-exists'), { description: t('workspace.removed-from-recent-items') })
    }
  },
  /** 将读取成功的文档写入编辑状态。 */
  openData: (data) => {
    // 文档状态独立于目录加载结果，目录失败仍可继续编辑。
    const doc = dataToDocument(data)
    set((state) => {
      const alreadyOpen = Object.values(state.openDocs).some(
        (item) => item.diskPath === doc.diskPath
      )
      const recentTabKeys = touchRecentTab(state.recentTabKeys, doc.key)
      if (alreadyOpen) {
        return {
          openDocs: { ...state.openDocs, [doc.key]: doc },
          recentTabKeys,
          activeKey: doc.key,
          activeHeading: 0,
          modeSyncTarget: null
        }
      }
      return {
        openDocs: { ...state.openDocs, [doc.key]: doc },
        tabOrder: [...state.tabOrder.filter((key) => key !== doc.key), doc.key],
        recentTabKeys,
        activeKey: doc.key,
        activeHeading: 0,
        modeSyncTarget: null
      }
    })
  },
  /** 建立文件父目录工作区，或展开已有工作区中的祖先目录。 */
  revealFileInWorkspace: async (path) => {
    try {
      // 当前根决定保留工作区还是切换到文件父目录。
      const root = get().workspaceRoot
      if (!root || !isInsideDir(root, path)) {
        // 直接加载快照，避免目录错误进入最近文件失效处理。
        const snapshot = await window.api.workspace.openPath(dirname(path))
        if (snapshot) get().setWorkspace(snapshot.root, snapshot.nodes)
        return
      }
      // 新扫描的节点暂存，全部成功后再提交，避免失败时破坏现有树。
      const treeNodes: Record<string, FileNode[]> = {}
      // 路径使用树中已有节点的格式，避免分隔符不同产生重复缓存键。
      const expandedDirs = [root]
      // 根层节点已经随工作区加载，可直接开始寻找文件的祖先。
      let nodes = get().treeNodes[root] ?? []
      while (true) {
        // 下一级祖先来自实际节点，保留磁盘路径的大小写与分隔符。
        const ancestor = nodes.find(
          (node) => node.type === 'directory' && isInsideDir(node.path, path)
        )
        if (!ancestor) break
        expandedDirs.push(ancestor.path)
        nodes = get().treeNodes[ancestor.path] ?? (await window.api.workspace.scan(ancestor.path))
        treeNodes[ancestor.path] = nodes
      }
      set((state) =>
        state.workspaceRoot === root
          ? {
              treeNodes: { ...state.treeNodes, ...treeNodes },
              expandedDirs: [...new Set([...state.expandedDirs, ...expandedDirs])]
            }
          : state
      )
    } catch {
      toast.warning(t('workspace.unable-to-load-the-file-s-directory'), { description: t('workspace.the-file-is-open-you-can-continue-editing') })
    }
  },
  newUntitled: () => {
    const doc = untitledDocument()
    set((state) => ({
      openDocs: { ...state.openDocs, [doc.key]: doc },
      tabOrder: [...state.tabOrder, doc.key],
      recentTabKeys: touchRecentTab(state.recentTabKeys, doc.key),
      activeKey: doc.key,
      activeHeading: 0,
      modeSyncTarget: null
    }))
  },
  activateTab: (key) => {
    set((state) => {
      const doc = state.openDocs[key]
      if (!doc) return state
      const recentTabKeys = touchRecentTab(state.recentTabKeys, key)
      if (state.mode === 'wysiwyg' && doc.viewMarkdownStale) {
        return {
          openDocs: { ...state.openDocs, [key]: syncDocViewMarkdown(doc) },
          recentTabKeys,
          activeKey: key,
          activeHeading: 0,
          modeSyncTarget: null
        }
      }
      return { recentTabKeys, activeKey: key, activeHeading: 0, modeSyncTarget: null }
    })
  },
  closeTab: (key) => {
    set((state) => {
      const openDocs = { ...state.openDocs }
      delete openDocs[key]
      const tabOrder = state.tabOrder.filter((item) => item !== key)
      let activeKey = state.activeKey
      if (activeKey === key) {
        const index = state.tabOrder.indexOf(key)
        activeKey = tabOrder[Math.max(0, index - 1)] ?? tabOrder[0] ?? null
      }
      let recentTabKeys = state.recentTabKeys.filter((item) => item !== key)
      if (activeKey) recentTabKeys = touchRecentTab(recentTabKeys, activeKey)
      return {
        openDocs,
        tabOrder,
        recentTabKeys,
        activeKey,
        activeHeading: 0,
        modeSyncTarget: null
      }
    })
  },
  updateActiveRawMarkdown: (rawMarkdown) => {
    const { activeKey, openDocs } = get()
    if (!activeKey) return
    const doc = openDocs[activeKey]
    if (!doc) return
    // 源码模式打字时统一延迟同步视图内容，避免隐藏保活的富文本编辑器在后台重渲染。
    const updatedDoc: OpenDocument = { ...doc, rawMarkdown, viewMarkdownStale: true }
    set((state) => ({
      openDocs: { ...state.openDocs, [activeKey]: updatedDoc }
    }))
  },
  /** 按文档键更新所见即所得正文，防止防抖回调在切换标签后串写到当前活动文档。 */
  updateDocumentMarkdown: (key, viewMarkdown) => {
    const { mode, openDocs } = get()
    const doc = openDocs[key]
    if (!doc) return
    // 切到源码模式并已有新输入时，忽略富文本切出前遗留的防抖回调。
    if (mode === 'source' && doc.viewMarkdownStale) return
    const rawMarkdown = doc.diskPath
      ? collapseInkdownImagePaths(viewMarkdown, doc.diskPath)
      : viewMarkdown
    set((state) => {
      const current = state.openDocs[key]
      if (!current) return state
      return {
        openDocs: {
          ...state.openDocs,
          [key]: { ...current, viewMarkdown, rawMarkdown, viewMarkdownStale: false }
        }
      }
    })
  },
  updateActiveMarkdown: (viewMarkdown) => {
    const { activeKey } = get()
    if (activeKey) get().updateDocumentMarkdown(activeKey, viewMarkdown)
  },
  saveDocument: (key, promptForMissingFile = false) => {
    const previous = documentSaveQueues.get(key) ?? Promise.resolve(true)
    const queued = previous
      .catch(() => false)
      .then(async () => {
        const doc = get().openDocs[key]
        if (!doc) return false
        if (!doc.diskPath || doc.isMissingOnDisk) {
          return promptForMissingFile && get().activeKey === key ? get().saveActiveAs() : false
        }
        if (doc.rawMarkdown === doc.savedRawMarkdown) return true

        const diskPath = doc.diskPath
        const rawMarkdown = doc.rawMarkdown
        const newline = doc.newline
        const hasBom = doc.hasBom
        get().setSaving(key, true)

        try {
          const result = await window.api.file.save({
            path: diskPath,
            content: rawMarkdown,
            newline,
            hasBom
          })
          set((state) => {
            const current = state.openDocs[key]
            if (!current || current.diskPath !== diskPath) return state
            return {
              openDocs: {
                ...state.openDocs,
                [key]: {
                  ...current,
                  diskPath: result.path,
                  name: basename(result.path),
                  savedRawMarkdown: rawMarkdown,
                  saving: false,
                  isMissingOnDisk: false
                }
              }
            }
          })
          return true
        } catch (error) {
          get().setSaving(key, false)
          if (isMissingPathError(error)) {
            set((state) => {
              // 仅标记仍指向本次保存路径的文档。
              const current = state.openDocs[key]
              if (!current || current.diskPath !== diskPath) return state
              return {
                openDocs: {
                  ...state.openDocs,
                  [key]: { ...current, isMissingOnDisk: true }
                }
              }
            })
            return promptForMissingFile && get().activeKey === key
              ? get().saveActiveAs()
              : false
          }
          toast.error(t('workspace.save-failed'), { description: formatErrorMessage(error) })
          return false
        }
      })

    documentSaveQueues.set(key, queued)
    void queued.finally(() => {
      if (documentSaveQueues.get(key) === queued) documentSaveQueues.delete(key)
    })
    return queued
  },
  saveActive: async () => {
    const { activeKey, openDocs } = get()
    if (!activeKey) return false
    const doc = openDocs[activeKey]
    if (!doc) return false
    if (!doc.diskPath || doc.isMissingOnDisk) return get().saveActiveAs()
    return get().saveDocument(activeKey, true)
  },
  saveActiveAs: async () => {
    const { activeKey, openDocs } = get()
    if (!activeKey) return false
    const doc = openDocs[activeKey]
    if (!doc) return false

    get().setSaving(activeKey, true)
    try {
      const result = await window.api.file.saveAs({
        defaultName: doc.name,
        content: doc.rawMarkdown,
        newline: doc.newline,
        hasBom: doc.hasBom
      })
      if (!result) {
        get().setSaving(activeKey, false)
        return false
      }
      set((state) => {
        const current = state.openDocs[activeKey]
        if (!current) return state
        return {
          openDocs: {
            ...state.openDocs,
            [activeKey]: {
              ...current,
              diskPath: result.path,
              name: result.name,
              savedRawMarkdown: doc.rawMarkdown,
              saving: false,
              isMissingOnDisk: false
            }
          }
        }
      })
      return true
    } catch (error) {
      get().setSaving(activeKey, false)
      toast.error(t('workspace.save-as-failed'), { description: formatErrorMessage(error) })
      return false
    }
  },
  setSaving: (key, saving) => {
    set((state) => {
      const doc = state.openDocs[key]
      if (!doc) return state
      return { openDocs: { ...state.openDocs, [key]: { ...doc, saving } } }
    })
  }
}))
