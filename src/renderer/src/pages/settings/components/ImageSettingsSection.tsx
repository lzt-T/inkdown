import { useEffect, useState } from 'react'
import { Check, FolderOpen, GitBranch, KeyRound, LoaderCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  GitHubImageStorageStatus,
  ImageStorageMode,
  ImageStorageSettings
} from '../../../../../shared/contracts'

// Image storage labels map fixed strategy keys to visible names.
const IMAGE_STORAGE_MODE_LABELS: Record<ImageStorageMode, string> = {
  relative: '相对文档目录',
  global: '全局固定目录',
  github: 'GitHub 图床'
}
// Ordered storage modes keep the segmented control stable.
const IMAGE_STORAGE_MODES: ImageStorageMode[] = ['relative', 'global', 'github']

/** Renders local and GitHub image storage configuration. */
export function ImageSettingsSection(): React.JSX.Element {
  // Persisted settings remain the source of truth for active imports.
  const [imageStorage, setImageStorage] = useState<ImageStorageSettings | null>(null)
  // Selected mode can preview the GitHub form before that mode is activated.
  const [selectedMode, setSelectedMode] = useState<ImageStorageMode>('relative')
  // GitHub status excludes the secret while reporting whether one exists.
  const [githubStatus, setGitHubStatus] = useState<GitHubImageStorageStatus | null>(null)
  // Editable directory text stays separate until validation succeeds.
  const [relativeDirectory, setRelativeDirectory] = useState('assets')
  // Repository input accepts owner/repository and canonical GitHub URLs.
  const [repository, setRepository] = useState('')
  // Token input is write-only and is cleared after a successful save.
  const [token, setToken] = useState('')
  // Shared pending state prevents overlapping settings mutations.
  const [isSaving, setIsSaving] = useState(false)
  // Relative path validation feedback is announced beside its input.
  const [relativeDirectoryError, setRelativeDirectoryError] = useState<string | null>(null)

  /** Persists image settings and applies normalized values from the main process. */
  const persistImageStorage = async (next: ImageStorageSettings): Promise<boolean> => {
    setIsSaving(true)
    try {
      // Main-process validation returns the canonical settings used by future imports.
      const state = await window.api.settings.set({ imageStorage: next })
      setImageStorage(state.imageStorage)
      setSelectedMode(state.imageStorage.mode)
      setRelativeDirectory(state.imageStorage.relativeDirectory)
      setRelativeDirectoryError(null)
      return true
    } catch (error) {
      toast.error('图片保存设置未更新', { description: String(error) })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  /** Selects and persists a global directory after native confirmation. */
  const selectGlobalDirectory = async (): Promise<void> => {
    if (!imageStorage || isSaving) return
    // Canceling the native picker leaves the current strategy unchanged.
    const directory = await window.api.image.selectDirectory()
    if (!directory) return
    await persistImageStorage({ ...imageStorage, mode: 'global', globalDirectory: directory })
  }

  /** Selects a storage strategy while deferring unconfigured GitHub activation. */
  const changeImageStorageMode = async (mode: ImageStorageMode): Promise<void> => {
    if (!imageStorage || isSaving) return
    if (mode === 'github' && (!githubStatus?.settings || !githubStatus.hasToken)) {
      setSelectedMode('github')
      return
    }
    if (mode === 'global' && !imageStorage.globalDirectory) {
      await selectGlobalDirectory()
      return
    }
    if (imageStorage.mode !== mode) await persistImageStorage({ ...imageStorage, mode })
    else setSelectedMode(mode)
  }

  /** Saves the relative directory or restores the last accepted value. */
  const saveRelativeDirectory = async (): Promise<void> => {
    if (!imageStorage || isSaving || relativeDirectory === imageStorage.relativeDirectory) return
    // Failed validation restores the persisted path and exposes a concise correction.
    const isSaved = await persistImageStorage({ ...imageStorage, relativeDirectory })
    if (!isSaved) {
      setRelativeDirectory(imageStorage.relativeDirectory)
      setRelativeDirectoryError('请输入不包含绝对路径或“..”的相对目录')
    }
  }

  /** Validates, securely stores, and activates the configured public GitHub repository. */
  const configureGitHub = async (): Promise<void> => {
    if (!imageStorage || isSaving) return
    if (!repository.trim()) {
      toast.error('请输入 GitHub 仓库地址')
      return
    }
    if (!githubStatus?.hasToken && !token.trim()) {
      toast.error('请输入具有 Contents 写入权限的 GitHub Token')
      return
    }

    setIsSaving(true)
    try {
      // Token crosses the isolated bridge once and is never returned to the renderer.
      const status = await window.api.image.configureGitHub({
        repository,
        token: token.trim() || null
      })
      setGitHubStatus(status)
      setImageStorage({ ...imageStorage, mode: 'github', github: status.settings })
      setSelectedMode('github')
      setToken('')
      toast.success('GitHub 图床已启用')
    } catch (error) {
      toast.error('GitHub 图床配置失败', { description: String(error) })
    } finally {
      setIsSaving(false)
    }
  }

  /** Clears repository metadata and the encrypted credential from this device. */
  const clearGitHub = async (): Promise<void> => {
    if (isSaving) return
    setIsSaving(true)
    try {
      // Main process falls back to relative storage before deleting the credential.
      const next = await window.api.image.clearGitHub()
      setImageStorage(next)
      setSelectedMode(next.mode)
      setGitHubStatus({ settings: null, hasToken: false })
      setRepository('')
      setToken('')
      toast.success('GitHub 图床配置已清除')
    } catch (error) {
      toast.error('无法清除 GitHub 图床配置', { description: String(error) })
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    // Mounted guard prevents late IPC responses from updating a closed settings page.
    let mounted = true
    // Initial request loads public settings and secret availability in parallel.
    const settingsRequest = window.api.settings.get()
    // Secret status is queried separately so the token never enters renderer state.
    const githubRequest = window.api.image.getGitHubStatus()
    void Promise.all([settingsRequest, githubRequest])
      .then(([state, status]) => {
        if (!mounted) return
        setImageStorage(state.imageStorage)
        setSelectedMode(state.imageStorage.mode)
        setRelativeDirectory(state.imageStorage.relativeDirectory)
        setGitHubStatus(status)
        if (status.settings) {
          setRepository(`${status.settings.owner}/${status.settings.repository}`)
        }
      })
      .catch((error) => {
        toast.error('无法读取图片设置', { description: String(error) })
      })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-semibold text-foreground">图片</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        设置新插入图片的保存位置，已有图片不会被移动。
      </p>

      <div className="mt-7">
        <h3 className="text-sm font-medium text-foreground">保存位置</h3>
        {imageStorage ? (
          <div className="mt-3 space-y-5">
            <div
              role="group"
              aria-label="图片保存模式"
              className="inline-grid grid-cols-3 rounded-md bg-muted p-1"
            >
              {IMAGE_STORAGE_MODES.map((mode) => {
                // Pressed state follows the visible selection, including unconfigured GitHub.
                const isSelected = selectedMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isSaving}
                    onClick={() => void changeImageStorageMode(mode)}
                    className={cn(
                      'rounded-sm px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
                      isSelected
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {IMAGE_STORAGE_MODE_LABELS[mode]}
                  </button>
                )
              })}
            </div>

            {selectedMode === 'relative' && (
              <div>
                <label htmlFor="relative-image-directory" className="text-sm font-medium text-foreground">
                  相对目录
                </label>
                <Input
                  id="relative-image-directory"
                  value={relativeDirectory}
                  disabled={isSaving}
                  aria-invalid={Boolean(relativeDirectoryError)}
                  aria-describedby="relative-image-directory-help"
                  className="mt-2 block max-w-xl"
                  placeholder="assets"
                  onChange={(event) => {
                    setRelativeDirectory(event.target.value)
                    setRelativeDirectoryError(null)
                  }}
                  onBlur={() => void saveRelativeDirectory()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                      setRelativeDirectory(imageStorage.relativeDirectory)
                      setRelativeDirectoryError(null)
                      event.currentTarget.blur()
                    }
                  }}
                />
                <p
                  id="relative-image-directory-help"
                  className={cn(
                    'mt-2 text-xs leading-5',
                    relativeDirectoryError ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {relativeDirectoryError ?? '例如 assets、assets/images；使用 . 可保存到文档同目录。'}
                </p>
              </div>
            )}

            {selectedMode === 'global' && (
              <div>
                <label htmlFor="global-image-directory" className="text-sm font-medium text-foreground">
                  全局目录
                </label>
                <div className="mt-2 flex flex-col gap-2 @min-[36rem]:flex-row">
                  <Input
                    id="global-image-directory"
                    value={imageStorage.globalDirectory ?? ''}
                    readOnly
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSaving}
                    onClick={() => void selectGlobalDirectory()}
                  >
                    <FolderOpen />
                    选择文件夹
                  </Button>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  全局目录使用绝对文件链接，移动文档后仍会引用此目录。
                </p>
              </div>
            )}

            {selectedMode === 'github' && (
              <div className="max-w-2xl space-y-5 border-y py-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <GitBranch className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">GitHub 公共仓库</p>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      新图片会提交到 images/年/月，并在 Markdown 中写入公开 raw 地址。
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor="github-image-repository" className="text-sm font-medium text-foreground">
                    仓库
                  </label>
                  <Input
                    id="github-image-repository"
                    value={repository}
                    disabled={isSaving}
                    className="mt-2"
                    placeholder="owner/repository"
                    onChange={(event) => setRepository(event.target.value)}
                  />
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    支持 owner/repository 或 https://github.com/owner/repository。
                  </p>
                </div>

                <div>
                  <label htmlFor="github-image-token" className="text-sm font-medium text-foreground">
                    Fine-grained Token
                  </label>
                  <div className="relative mt-2">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="github-image-token"
                      type="password"
                      value={token}
                      disabled={isSaving}
                      autoComplete="off"
                      className="pl-9"
                      placeholder={githubStatus?.hasToken ? '留空则继续使用已保存的 Token' : 'github_pat_…'}
                      onChange={(event) => setToken(event.target.value)}
                    />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Token 需要目标仓库的 Contents 写入权限，并使用系统安全存储加密保存在本机。
                  </p>
                </div>

                {githubStatus?.settings && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {githubStatus.hasToken ? (
                      <Check className="size-3.5 text-primary" />
                    ) : (
                      <KeyRound className="size-3.5 text-destructive" />
                    )}
                    {githubStatus.hasToken ? '已连接' : '凭证不可用'}{' '}
                    {githubStatus.settings.owner}/{githubStatus.settings.repository} · 分支{' '}
                    {githubStatus.settings.branch}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={isSaving} onClick={() => void configureGitHub()}>
                    {isSaving ? <LoaderCircle className="animate-spin" /> : <GitBranch />}
                    {githubStatus?.settings ? '保存并启用' : '连接并启用'}
                  </Button>
                  {githubStatus?.settings && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() => void clearGitHub()}
                    >
                      <Trash2 />
                      清除配置
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">正在加载图片设置...</p>
        )}
      </div>
    </div>
  )
}
