import { useEffect, useState } from 'react'
import { LoaderCircle, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ProxyMode, ProxySettings } from '../../../../../shared/contracts'

interface ProxyModeOption {
  value: ProxyMode
  label: string
}

// Proxy modes retain a stable order in the connection control.
const PROXY_MODE_OPTIONS: ProxyModeOption[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'direct', label: '直连' },
  { value: 'manual', label: '手动代理' }
]

/** Renders and applies application-wide network proxy settings. */
export function ProxySettingsSection(): React.JSX.Element {
  // Persisted proxy settings provide the comparison baseline for unsaved edits.
  const [proxy, setProxy] = useState<ProxySettings | null>(null)
  // Selected mode can change independently until the user saves it.
  const [mode, setMode] = useState<ProxyMode>('system')
  // Server input retains the last manual value across mode changes.
  const [server, setServer] = useState('')
  // Server validation feedback stays adjacent to its input.
  const [serverError, setServerError] = useState<string | null>(null)
  // Pending state prevents overlapping proxy changes.
  const [isSaving, setIsSaving] = useState(false)
  // Any changed field enables the explicit save action.
  const isDirty = Boolean(proxy && (mode !== proxy.mode || server !== proxy.server))

  /** Saves the current proxy form and applies the canonical main-process response. */
  const saveProxy = async (): Promise<void> => {
    if (!proxy || isSaving || !isDirty) return
    if (mode === 'manual' && !server.trim()) {
      setServerError('请输入代理地址')
      return
    }

    setIsSaving(true)
    setServerError(null)
    try {
      // Main-process validation returns the exact settings active in both network sessions.
      const state = await window.api.settings.set({ proxy: { mode, server } })
      setProxy(state.proxy)
      setMode(state.proxy.mode)
      setServer(state.proxy.server)
      toast.success('代理设置已应用')
    } catch (error) {
      // Manual-mode failures are shown beside the server field and in the global toast.
      const message = error instanceof Error ? error.message : String(error)
      if (mode === 'manual') setServerError(message)
      toast.error('代理设置未更新', { description: message })
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    // Mounted guard prevents late IPC responses from updating a closed settings page.
    let mounted = true
    void window.api.settings
      .get()
      .then((state) => {
        if (!mounted) return
        setProxy(state.proxy)
        setMode(state.proxy.mode)
        setServer(state.proxy.server)
      })
      .catch((error) => {
        toast.error('无法读取代理设置', { description: String(error) })
      })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-semibold text-foreground">网络</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        仅配置 Inkdown 的更新、GitHub 图床和应用内网络连接。
      </p>

      <div className="mt-7">
        <h3 className="text-sm font-medium text-foreground">代理模式</h3>
        {proxy ? (
          <div className="mt-3 flex flex-col items-start gap-5">
            <div
              role="group"
              aria-label="代理模式"
              className="inline-grid grid-cols-3 rounded-md bg-muted p-1"
            >
              {PROXY_MODE_OPTIONS.map((option) => {
                // Pressed state reflects the current unsaved selection.
                const isSelected = mode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isSaving}
                    onClick={() => {
                      setMode(option.value)
                      setServerError(null)
                    }}
                    className={cn(
                      'rounded-sm px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
                      isSelected
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>

            {mode === 'manual' && (
              <div className="w-full max-w-2xl border-y py-5">
                <div>
                  <label htmlFor="proxy-server" className="text-sm font-medium text-foreground">
                    代理服务器
                  </label>
                  <Input
                    id="proxy-server"
                    value={server}
                    disabled={isSaving}
                    aria-invalid={Boolean(serverError)}
                    aria-describedby="proxy-server-help"
                    className="mt-2"
                    placeholder="http://127.0.0.1:7890"
                    onChange={(event) => {
                      setServer(event.target.value)
                      setServerError(null)
                    }}
                  />
                  <p
                    id="proxy-server-help"
                    className={cn(
                      'mt-2 text-xs leading-5',
                      serverError ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    {serverError ?? '支持 HTTP、HTTPS、SOCKS4 和 SOCKS5，地址必须包含端口。'}
                  </p>
                </div>
              </div>
            )}

            <Button
              type="button"
              disabled={isSaving || !isDirty}
              onClick={() => void saveProxy()}
            >
              {isSaving ? <LoaderCircle className="animate-spin" /> : <Save />}
              保存并应用
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">正在加载代理设置...</p>
        )}
      </div>
    </div>
  )
}
