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
  outlineOpen: boolean
  recent: RecentState
  activeHeading: number
  headingTarget: { index: number; nonce: number } | null

  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  setMode: (mode: EditorMode) => void
  toggleMode: () => void
  toggleSidebar: () => void
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
const storedSidebar = localStorage.getItem('inkdown.sidebar') !== '0'
const storedOutline = localStorage.getItem('inkdown.outline') !== '0'

export const useEditorStore = create<EditorStore>((set, get) => ({
  workspaceRoot: null,
  treeNodes: {},
  expandedDirs: [],
  openDocs: {},
  tabOrder: [],
  activeKey: null,
  mode: 'wysiwyg',
  theme: storedTheme,
  sidebarOpen: storedSidebar,
  outlineOpen: storedOutline,
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
    const next = !get().sidebarOpen
    localStorage.setItem('inkdown.sidebar', next ? '1' : '0')
    set({ sidebarOpen: next })
  },
  toggleOutline: () => {
    const next = !get().outlineOpen
    localStorage.setItem('inkdown.outline', next ? '1' : '0')
    set({ outlineOpen: next })
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
    const openDocs = get().openDocs
    for (const doc of Object.values(openDocs)) {
      if (!doc.diskPath || !isInsideDir(directory, doc.diskPath)) continue
      if (doc.rawMarkdown !== doc.savedRawMarkdown) continue
      try {
        const data = await window.api.file.read(doc.diskPath)
        const next = dataToDocument(data)
        set((state) => ({ openDocs: { ...state.openDocs, [doc.key]: next } }))
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
      const alreadyOpen = Object.values(state.openDocs).some((item) => item.diskPath === doc.diskPath)
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
    const viewMarkdown = doc.diskPath ? expandLocalImagePaths(rawMarkdown, doc.diskPath) : rawMarkdown
    set((state) => ({
      openDocs: { ...state.openDocs, [activeKey]: { ...doc, rawMarkdown, viewMarkdown } }
    }))
  },
  updateActiveMarkdown: (viewMarkdown) => {
    const { activeKey, openDocs } = get()
    if (!activeKey) return
    const doc = openDocs[activeKey]
    if (!doc) return
    const rawMarkdown = doc.diskPath ? collapseInkdownImagePaths(viewMarkdown, doc.diskPath) : viewMarkdown
    set((state) => ({
      openDocs: {
        ...state.openDocs,
        [activeKey]: { ...doc, viewMarkdown, rawMarkdown }
      }
    }))
  },
  saveActive: async () => {
    const { activeKey, openDocs } = get()
    if (!activeKey) return false
    const doc = openDocs[activeKey]
    if (!doc) return false
    if (!doc.diskPath) return get().saveActiveAs()

    get().setSaving(activeKey, true)
    try {
      const result = await window.api.file.save({
        path: doc.diskPath,
        content: doc.rawMarkdown,
        newline: doc.newline,
        hasBom: doc.hasBom
      })
      set((state) => ({
        openDocs: {
          ...state.openDocs,
          [activeKey]: {
            ...state.openDocs[activeKey],
            diskPath: result.path,
            name: basename(result.path),
            savedRawMarkdown: doc.rawMarkdown,
            saving: false
          }
        }
      }))
      return true
    } catch (error) {
      get().setSaving(activeKey, false)
      toast.error('保存失败', { description: String(error) })
      return false
    }
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
      set((state) => ({
        openDocs: {
          ...state.openDocs,
          [activeKey]: {
            ...state.openDocs[activeKey],
            diskPath: result.path,
            name: result.name,
            savedRawMarkdown: doc.rawMarkdown,
            saving: false
          }
        }
      }))
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



