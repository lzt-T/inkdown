import { session, type ProxyConfig } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ProxyMode, ProxySettings } from '../shared/contracts'

// Supported proxy modes guard persisted and renderer-provided values.
const PROXY_MODES = new Set<ProxyMode>(['system', 'direct', 'manual'])
// Supported protocols match Chromium's fixed proxy server schemes.
const PROXY_PROTOCOLS = new Set(['http:', 'https:', 'socks4:', 'socks5:'])
// Electron modes map fixed business keys to their Chromium equivalents.
const ELECTRON_PROXY_MODES: Record<ProxyMode, ProxyConfig['mode']> = {
  system: 'system',
  direct: 'direct',
  manual: 'fixed_servers'
}

/** Normalizes and validates one manual proxy server address. */
function normalizeProxyServer(server: string): string {
  // Trimmed input is normalized to an explicit HTTP URL when no scheme is present.
  const trimmed = server.trim()
  // Explicit URL form gives validation consistent host, port, and credential handling.
  const value = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  // Parsed proxy components are validated before reaching Electron.
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('请输入有效的代理地址，例如 127.0.0.1:7890')
  }
  // Raw authority preserves explicitly supplied default ports that URL normalizes away.
  const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/, 1)[0]
  // Final numeric segment is the required proxy port for hostnames and bracketed IPv6 hosts.
  const portMatch = authority.match(/:(\d+)$/)
  // Normalized numeric port prevents ambiguous zero-padded or out-of-range values.
  const port = Number(portMatch?.[1])

  if (!PROXY_PROTOCOLS.has(url.protocol)) {
    throw new Error('代理仅支持 HTTP、HTTPS、SOCKS4 或 SOCKS5 协议')
  }
  if (!url.hostname || !portMatch || port < 1 || port > 65535) {
    throw new Error('代理地址必须包含有效的主机和端口')
  }
  if (url.username || url.password) throw new Error('当前版本不支持需要账号密码的代理')
  if (url.pathname !== '/' || value.includes('?') || value.includes('#')) {
    throw new Error('代理地址不能包含路径、查询参数或片段')
  }
  return `${url.protocol}//${url.hostname}:${port}`
}

/** Converts one persisted proxy mode into Electron session configuration. */
function createElectronProxyConfig(settings: ProxySettings): ProxyConfig {
  if (settings.mode !== 'manual') return { mode: ELECTRON_PROXY_MODES[settings.mode] }
  return {
    mode: ELECTRON_PROXY_MODES.manual,
    proxyRules: settings.server
  }
}

/** Validates proxy settings and returns their canonical persisted form. */
export function normalizeProxySettings(settings: ProxySettings): ProxySettings {
  if (!PROXY_MODES.has(settings.mode)) throw new Error('不支持的代理模式')
  // Manual mode requires a usable server while other modes retain the previous input.
  const server = settings.mode === 'manual' ? normalizeProxyServer(settings.server) : settings.server.trim()
  return { mode: settings.mode, server }
}

/** Applies proxy settings to application traffic and the updater's isolated session. */
export async function applyProxySettings(settings: ProxySettings): Promise<ProxySettings> {
  // Canonical settings keep runtime and persisted proxy rules identical.
  const normalized = normalizeProxySettings(settings)
  // Both sessions must receive the same config because electron-updater uses its own partition.
  const config = createElectronProxyConfig(normalized)
  // Named sessions are reused for applying settings and closing their existing connection pools.
  const applicationSession = session.defaultSession
  // Updater traffic uses a separate persistent session managed by electron-updater.
  const updaterSession = autoUpdater.netSession
  await Promise.all([
    applicationSession.setProxy(config),
    updaterSession.setProxy(config)
  ])
  // Closing pooled sockets ensures subsequent requests do not retain the previous proxy.
  await Promise.all([
    applicationSession.closeAllConnections(),
    updaterSession.closeAllConnections()
  ])
  return normalized
}
