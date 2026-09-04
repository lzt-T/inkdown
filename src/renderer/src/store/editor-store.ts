import { create } from 'zustand'
import { toast } from 'sonner'
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
  basename
} from '../lib/markdown-paths'

export interface OpenDocument {
  key: string
  diskPath: string | null
  name: string
  rawMarkdown: string
  viewMarkdown: string
  savedRawMarkdown: string
  newline: '\r\n' | '\n'
  hasBom: boolean
  saving: boolean
  isMissingOnDisk: boolean
}

type SidebarView = 'files' | 'outline'
type RecentEntryKind = 'file' | 'workspace'

interface EditorStore {
  workspaceRoot: string | null
  treeNodes: Record<string, FileNode[]>
  expandedDirs: string[]
  openDocs: Record<string, OpenDocument>
  tabOrder: string[]
  activeKey: string | null
  mode: EditorMode
  theme: ThemeMode
  sidebarOpen: boolean
  sidebarView: SidebarView
  recent: RecentState
  activeHeading: number
  headingTarget: { index: number; nonce: number } | null

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

  openWorkspace: () => Promise<void>
  openWorkspacePath: (path: string) => Promise<void>
  setWorkspace: (root: string, nodes: FileNode[]) => void
  closeWorkspace: () => void
  setTreeNodes: (directory: string, nodes: FileNode[]) => void
  expandDirectory: (directory: string) => Promise<void>
  collapseDirectory: (directory: string) => void
  refreshDirectory: (directory: string) => Promise<void>
  handleWorkspaceChange: (directory: string) => Promise<void>

  openFileDialog: () => Promise<void>
  openPath: (path: string) => Promise<void>
  openData: (data: OpenFileData) => void
  newUntitled: () => void
  activateTab: (key: string) => void
  closeTab: (key: string) => void
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
    savedRawMarkdown: data.content,
    newline: data.newline,
    hasBom: data.hasBom,
    saving: false,
    isMissingOnDisk: false
  }
}

function untitledDocument(): OpenDocument {
  const id = crypto.randomUUID()
  return {
    key: `untitled:${id}`,
    diskPath: null,
    name: '未命名.md',
    rawMarkdown: '',
    viewMarkdown: '',
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
// 旧版文件树开关兼作新版侧栏总开关。
const storedSidebarOpen = localStorage.getItem('inkdown.sidebar') !== '0'
// 旧版大纲开关用于首次迁移时确定默认页签。
const storedOutlineOpen = localStorage.getItem('inkdown.outline') !== '0'
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
  activeKey: null,
  mode: 'wysiwyg',
  theme: storedTheme,
  sidebarOpen: storedSidebarView ? storedSidebarOpen : storedSidebarOpen || storedOutlineOpen,
  sidebarView: storedSidebarView ?? (storedOutlineOpen ? 'outline' : 'files'),
  recent: { workspaces: [], files: [], lastWorkspace: null },
  activeHeading: 0,
  headingTarget: null,

  setTheme: (theme) => {
    localStorage.setItem('inkdown.theme', theme)
    set({ theme })
  },
  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    get().setTheme(next)
  },
  setMode: (mode) => set({ mode }),
  toggleMode: () => set({ mode: get().mode === 'wysiwyg' ? 'source' : 'wysiwyg' }),
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
  setActiveHeading: (activeHeading) => set({ activeHeading }),
  scrollToHeading: (index) => set({ headingTarget: { index, nonce: Date.now() } }),
  consumeHeadingTarget: () => set({ headingTarget: null }),

  /** 按路径打开工作区，并清理已经失效的最近工作区记录。 */
  openWorkspacePath: async (path) => {
    try {
      // 工作区快照用于初始化根目录及首层文件树。
      const snapshot = await window.api.workspace.openPath(path)
      if (!snapshot) return
      set({
        workspaceRoot: snapshot.root,
        treeNodes: { [snapshot.root]: snapshot.nodes },
        expandedDirs: [snapshot.root]
      })
    } catch (error) {
      if (!isMissingPathError(error)) {
        toast.error('无法打开文件夹', { description: String(error) })
        return
      }
      // 持久化结果用于刷新最近工作区并停止后续启动恢复。
      const recent = await persistRecentPathRemoval(get().recent, 'workspace', path)
      get().setRecent(recent)
      toast.warning('文件夹已不存在', { description: '已从最近使用中移除' })
    }
  },
  openWorkspace: async () => {
    const snapshot = await window.api.workspace.open()
    if (!snapshot) return
    set({
      workspaceRoot: snapshot.root,
      treeNodes: { [snapshot.root]: snapshot.nodes },
      expandedDirs: [snapshot.root]
    })
  },
  setWorkspace: (root, nodes) => {
    set({ workspaceRoot: root, treeNodes: { [root]: nodes }, expandedDirs: [root] })
  },
  closeWorkspace: () => set({ workspaceRoot: null, treeNodes: {}, expandedDirs: [] }),
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
  handleWorkspaceChange: async (directory) => {
    await get().refreshDirectory(directory)
    const candidates = Object.values(get().openDocs)
    for (const doc of candidates) {
      if (!doc.diskPath || !isInsideDir(directory, doc.diskPath)) continue
      const expectedPath = doc.diskPath
      const expectedRawMarkdown = doc.rawMarkdown
      const expectedSavedRawMarkdown = doc.savedRawMarkdown
      try {
        const data = await window.api.file.read(expectedPath)
        if (expectedRawMarkdown !== expectedSavedRawMarkdown) continue
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
        if (!isMissingPathError(error)) continue
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
  },

  openFileDialog: async () => {
    const data = await window.api.file.open()
    if (!data) return
    get().openData(data)
  },
  /** 按路径打开文件，并清理已经失效的最近文件记录。 */
  openPath: async (path) => {
    try {
      // 文件数据仅在路径成功读取后交给编辑器打开。
      const data = await window.api.file.openPath(path)
      get().openData(data)
    } catch (error) {
      if (!isMissingPathError(error)) {
        toast.error('无法打开文件', { description: String(error) })
        return
      }
      // 持久化结果用于立即刷新欢迎页中的最近文件。
      const recent = await persistRecentPathRemoval(get().recent, 'file', path)
      get().setRecent(recent)
      toast.warning('文件已不存在', { description: '已从最近使用中移除' })
    }
  },
  openData: (data) => {
    const doc = dataToDocument(data)
    set((state) => {
      const alreadyOpen = Object.values(state.openDocs).some(
        (item) => item.diskPath === doc.diskPath
      )
      if (alreadyOpen) {
        return {
          openDocs: { ...state.openDocs, [doc.key]: doc },
          activeKey: doc.key,
          activeHeading: 0
        }
      }
      return {
        openDocs: { ...state.openDocs, [doc.key]: doc },
        tabOrder: [...state.tabOrder.filter((key) => key !== doc.key), doc.key],
        activeKey: doc.key,
        activeHeading: 0
      }
    })
  },
  newUntitled: () => {
    const doc = untitledDocument()
    set((state) => ({
      openDocs: { ...state.openDocs, [doc.key]: doc },
      tabOrder: [...state.tabOrder, doc.key],
      activeKey: doc.key,
      activeHeading: 0
    }))
  },
  activateTab: (key) => {
    if (get().openDocs[key]) set({ activeKey: key, activeHeading: 0 })
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
      return { openDocs, tabOrder, activeKey, activeHeading: 0 }
    })
  },
  updateActiveRawMarkdown: (rawMarkdown) => {
    const { activeKey, openDocs } = get()
    if (!activeKey) return
    const doc = openDocs[activeKey]
    if (!doc) return
    const viewMarkdown = doc.diskPath
      ? expandLocalImagePaths(rawMarkdown, doc.diskPath)
      : rawMarkdown
    set((state) => ({
      openDocs: { ...state.openDocs, [activeKey]: { ...doc, rawMarkdown, viewMarkdown } }
    }))
  },
  updateActiveMarkdown: (viewMarkdown) => {
    const { activeKey, openDocs } = get()
    if (!activeKey) return
    const doc = openDocs[activeKey]
    if (!doc) return
    const rawMarkdown = doc.diskPath
      ? collapseInkdownImagePaths(viewMarkdown, doc.diskPath)
      : viewMarkdown
    set((state) => ({
      openDocs: {
        ...state.openDocs,
        [activeKey]: { ...doc, viewMarkdown, rawMarkdown }
      }
    }))
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
          toast.error('保存失败', { description: String(error) })
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
      toast.error('另存为失败', { description: String(error) })
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
