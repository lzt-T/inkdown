import { FilePlus, FolderOpen, FileText } from 'lucide-react'
import { useEditorStore } from '../store/editor-store'
import { Button } from './ui/button'

export function Welcome(): React.JSX.Element {
  const recent = useEditorStore((state) => state.recent)
  const openWorkspace = useEditorStore((state) => state.openWorkspace)
  const openWorkspacePath = useEditorStore((state) => state.openWorkspacePath)
  const openFileDialog = useEditorStore((state) => state.openFileDialog)
  const openPath = useEditorStore((state) => state.openPath)
  const newUntitled = useEditorStore((state) => state.newUntitled)

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-background">
      <div className="w-full max-w-xl px-6 py-10">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">Inkdown</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          一个本地优先的 Typora 风格 Markdown 编辑器。
        </p>

        <div className="mb-6 flex flex-wrap gap-3">
          <Button onClick={newUntitled}>
            <FilePlus /> 新建文件
          </Button>
          <Button variant="outline" onClick={() => void openFileDialog()}>
            <FileText /> 打开文件
          </Button>
          <Button variant="outline" onClick={() => void openWorkspace()}>
            <FolderOpen /> 打开文件夹
          </Button>
        </div>

        {recent.files.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2 text-xs font-medium text-muted-foreground">最近文件</h2>
            <div className="space-y-1">
              {recent.files.slice(0, 6).map((path) => (
                <button
                  key={path}
                  onClick={() => void openPath(path)}
                  className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                >
                  {path}
                </button>
              ))}
            </div>
          </section>
        )}

        {recent.workspaces.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-medium text-muted-foreground">最近文件夹</h2>
            <div className="space-y-1">
              {recent.workspaces.slice(0, 6).map((path) => (
                <button
                  key={path}
                  onClick={() => void openWorkspacePath(path)}
                  className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                >
                  {path}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

