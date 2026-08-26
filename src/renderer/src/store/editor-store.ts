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
}

type SidebarView = 'files' | 'outline'

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
  saveDocument: (key: string) => Promise<boolean>
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
    saving: false
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
    saving: false
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

  openWorkspacePath: async (path) => {
    const snapshot = await window.api.workspace.openPath(path)
    if (!snapshot) return
    set({
      workspaceRoot: snapshot.root,
      treeNodes: { [snapshot.root]: snapshot.nodes },
      expandedDirs: [snapshot.root]
    })
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
    set((state) => ({ treeNodes: { ...state.treeNodes, [directory]: nodes } }))
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
      if (doc.rawMarkdown !== doc.savedRawMarkdown) continue
      const expectedPath = doc.diskPath
      const expectedRawMarkdown = doc.rawMarkdown
      const expectedSavedRawMarkdown = doc.savedRawMarkdown
      try {
        const data = await window.api.file.read(expectedPath)
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
      } catch {
        // 文件可能已被删除或锁定，保留当前缓冲区。
      }
    }
  },

  openFileDialog: async () => {
    const data = await window.api.file.open()
    if (!data) return
    get().openData(data)
  },
  openPath: async (path) => {
    try {
      const data = await window.api.file.openPath(path)
      get().openData(data)
    } catch (error) {
      toast.error('无法打开文件', { description: String(error) })
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
  saveDocument: (key) => {
    const previous = documentSaveQueues.get(key) ?? Promise.resolve(true)
    const queued = previous
      .catch(() => false)
      .then(async () => {
        const doc = get().openDocs[key]
        if (!doc) return false
        if (!doc.diskPath) {
          return get().activeKey === key ? get().saveActiveAs() : false
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
                  saving: false
                }
              }
            }
          })
          return true
        } catch (error) {
          get().setSaving(key, false)
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
    if (!doc.diskPath) return get().saveActiveAs()
    return get().saveDocument(activeKey)
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
              saving: false
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
