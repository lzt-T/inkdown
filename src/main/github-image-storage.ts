import { randomUUID } from 'crypto'
import { app, net, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import { basename, join } from 'path'
import type {
  ConfigureGitHubImageStorageRequest,
  GitHubImageStorageSettings,
  GitHubImageStorageStatus,
  ImportImageResult
} from '../shared/contracts'
import { loadState } from './state'

// GitHub API constants keep every repository request on the same supported contract.
const GITHUB_API_URL = 'https://api.github.com'
// Version header pins request semantics to the currently supported GitHub REST contract.
const GITHUB_API_VERSION = '2026-03-10'
// Token filename stores only operating-system-encrypted bytes.
const GITHUB_TOKEN_FILE = 'github-image-token.bin'
// Upload queue serializes commits targeting the same configured branch.
let githubUploadQueue: Promise<unknown> = Promise.resolve()

interface GitHubRepositoryResponse {
  private: boolean
  default_branch: string
}

interface GitHubUploadResponse {
  content?: {
    download_url?: string | null
  }
}

/** Returns the fixed encrypted-token path inside Electron's application data directory. */
function tokenPath(): string {
  return join(app.getPath('userData'), GITHUB_TOKEN_FILE)
}

/** Builds authenticated headers without exposing the token outside the main process. */
function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION
  }
}

/** Requires an operating-system-backed secure storage provider. */
async function assertSecureStorageAvailable(): Promise<void> {
  // Async availability accounts for temporarily unavailable credential providers.
  const isAvailable = await safeStorage.isAsyncEncryptionAvailable()
  // Linux basic text storage does not satisfy the no-plaintext credential requirement.
  const isPlainTextBackend =
    process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text'
  if (!isAvailable || isPlainTextBackend) {
    throw new Error('系统安全存储不可用，无法安全保存 GitHub Token')
  }
}

/** Parses either owner/repository or a GitHub.com repository URL. */
function parseRepository(value: string): { owner: string; repository: string } {
  // Repository input accepts the familiar short form and canonical HTTPS URL.
  const trimmed = value.trim()
  // Repository path is normalized before owner and repository validation.
  let repositoryPath = trimmed
  if (/^https?:\/\//i.test(trimmed)) {
    // Parsed URL enforces the supported HTTPS GitHub.com origin.
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') {
      throw new Error('仅支持 GitHub.com 仓库地址')
    }
    repositoryPath = url.pathname.replace(/^\/+|\/+$/g, '')
  }

  // Exactly two path segments identify one GitHub repository.
  const parts = repositoryPath.replace(/\.git$/i, '').split('/')
  // Owner segment is validated against GitHub account naming characters.
  const owner = parts[0] ?? ''
  // Repository segment excludes path separators and unsupported characters.
  const repository = parts[1] ?? ''
  if (
    parts.length !== 2 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(owner) ||
    !/^[a-zA-Z0-9._-]+$/.test(repository)
  ) {
    throw new Error('请输入 owner/repository 或完整 GitHub 仓库地址')
  }
  return { owner, repository }
}

/** Converts a failed GitHub response into a concise recovery-oriented error. */
function githubRequestError(status: number): Error {
  // Status mapping avoids leaking remote response bodies or credentials into renderer logs.
  const messages: Record<number, string> = {
    401: 'GitHub Token 无效，请重新配置',
    403: 'GitHub 拒绝访问，请确认 Token 具有 Contents 写入权限且未触发限流',
    404: 'GitHub 仓库或默认分支不存在，或 Token 无权访问',
    409: 'GitHub 分支发生提交冲突，请稍后重试',
    422: 'GitHub 拒绝了图片文件，请检查仓库配置后重试'
  }
  return new Error(messages[status] ?? `GitHub 请求失败（HTTP ${status}）`)
}

/** Reads and decrypts the locally stored GitHub token. */
async function readGitHubToken(): Promise<string> {
  await assertSecureStorageAvailable()
  // Encrypted bytes never cross the main-process boundary.
  const encrypted = await fs.readFile(tokenPath())
  // Decryption result supplies the main-process-only bearer credential.
  const decrypted = await safeStorage.decryptStringAsync(encrypted)
  if (!decrypted.result) throw new Error('GitHub Token 尚未配置')
  if (decrypted.shouldReEncrypt) await writeGitHubToken(decrypted.result)
  return decrypted.result
}

/** Encrypts a GitHub token with the operating-system credential provider. */
async function writeGitHubToken(token: string): Promise<void> {
  await assertSecureStorageAvailable()
  // Operating-system encryption protects the credential before filesystem persistence.
  const encrypted = await safeStorage.encryptStringAsync(token)
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(tokenPath(), encrypted)
}

/** Returns renderer-safe GitHub configuration without decrypting or exposing the token. */
export async function getGitHubImageStorageStatus(): Promise<GitHubImageStorageStatus> {
  // Public repository metadata may safely be returned to the renderer.
  const settings = (await loadState()).imageStorage.github
  // Credential presence defaults false for missing or unavailable secure storage.
  let hasToken = false
  try {
    hasToken = Boolean(await readGitHubToken())
  } catch {
    // Missing, corrupt, or temporarily unavailable credentials are reported as unconfigured.
  }
  return { settings, hasToken }
}

/** Validates a public repository, securely stores its token, and returns its default branch. */
export async function configureGitHubImageStorage(
  request: ConfigureGitHubImageStorageRequest
): Promise<GitHubImageStorageSettings> {
  // Parsed repository identity is validated before making a remote request.
  const repository = parseRepository(request.repository)
  // Blank replacement input deliberately reuses the existing encrypted credential.
  const token = request.token?.trim() || (await readGitHubToken())
  // Repository metadata confirms visibility and discovers the default branch.
  const response = await net.fetch(
    `${GITHUB_API_URL}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}`,
    { headers: githubHeaders(token) }
  )
  if (!response.ok) throw githubRequestError(response.status)

  // Typed metadata contains only fields required by the image storage configuration.
  const data = (await response.json()) as GitHubRepositoryResponse
  if (data.private) throw new Error('首期仅支持公开 GitHub 仓库')
  if (!data.default_branch) throw new Error('GitHub 仓库没有可用的默认分支')

  await writeGitHubToken(token)
  return { ...repository, branch: data.default_branch }
}

/** Removes the encrypted GitHub credential from this device. */
export async function clearGitHubImageStorageToken(): Promise<void> {
  await fs.rm(tokenPath(), { force: true })
}

/** Creates a collision-resistant repository path while preserving a readable source name. */
function createImagePath(name: string): string {
  // Local calendar folders match how users browse newly uploaded images.
  const now = new Date()
  // Four-digit year forms the first repository directory partition.
  const year = String(now.getFullYear())
  // Zero-padded month keeps repository directories ordered lexically.
  const month = String(now.getMonth() + 1).padStart(2, '0')
  // Compact timestamp makes upload chronology visible in filenames.
  const timestamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  // Safe source name preserves readability without allowing repository path injection.
  const safeName = basename(name).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image'
  return `images/${year}/${month}/${timestamp}-${randomUUID().slice(0, 8)}-${safeName}`
}

/** Uploads one image to the configured GitHub repository and returns its public raw URL. */
async function uploadGitHubImageNow(input: {
  name: string
  data: Uint8Array
}): Promise<ImportImageResult> {
  // Current persisted repository is read for every queued upload.
  const settings = (await loadState()).imageStorage.github
  if (!settings) throw new Error('请先配置 GitHub 图床')
  // Decrypted token remains scoped to this main-process request.
  const token = await readGitHubToken()
  // Unique path prevents accidental replacement and supplies date-based organization.
  const imagePath = createImagePath(input.name)
  // Segment encoding preserves repository separators while escaping filename characters.
  const encodedPath = imagePath.split('/').map(encodeURIComponent).join('/')
  // Contents API creates one file and commit on the configured default branch.
  const response = await net.fetch(
    `${GITHUB_API_URL}/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repository)}/contents/${encodedPath}`,
    {
      method: 'PUT',
      headers: githubHeaders(token),
      body: JSON.stringify({
        message: `Upload image via Inkdown: ${basename(imagePath)}`,
        content: Buffer.from(input.data).toString('base64'),
        branch: settings.branch
      })
    }
  )
  if (!response.ok) throw githubRequestError(response.status)

  // Upload response supplies GitHub's canonical public download address.
  const result = (await response.json()) as GitHubUploadResponse
  // Public raw URL is the portable source written into Markdown.
  const src = result.content?.download_url
  if (!src) throw new Error('GitHub 未返回可访问的图片地址')
  return {
    src,
    fileName: basename(imagePath),
    relativePath: null,
    storageMode: 'github'
  }
}

/** Serializes GitHub image commits to avoid branch-head conflicts. */
export function uploadGitHubImage(input: {
  name: string
  data: Uint8Array
}): Promise<ImportImageResult> {
  // Previous failures are consumed so later images can continue through the queue.
  const upload = githubUploadQueue.catch(() => undefined).then(() => uploadGitHubImageNow(input))
  githubUploadQueue = upload
  return upload
}
