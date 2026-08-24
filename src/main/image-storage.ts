import { dirname, isAbsolute, resolve } from 'path'
import type {
  ImageStorageMode,
  ImageStorageSettings,
  ImportImageRequest,
  ImportImageResult
} from '../shared/contracts'
import { importImage } from './files'
import { uploadGitHubImage } from './github-image-storage'
import { isAuthorized, isInside, setImageRoot } from './security'
import { loadState } from './state'

/** Validates and normalizes the document-relative image directory setting. */
function normalizeRelativeImageDirectory(value: string): string {
  // Forward slashes keep the persisted setting portable across desktop platforms.
  const normalized = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
  // Path segments prevent configured images from escaping the document directory.
  const segments = normalized.split('/').filter((segment) => segment && segment !== '.')
  if (
    !normalized ||
    isAbsolute(normalized) ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.split('/').includes('..')
  ) {
    throw new Error('请输入文档目录内的相对路径')
  }
  return segments.length === 0 ? '.' : segments.join('/')
}

/** Validates persisted GitHub repository metadata before it can become active. */
function normalizeGitHubSettings(settings: ImageStorageSettings): ImageStorageSettings['github'] {
  // Optional metadata remains inactive until configuration succeeds.
  const github = settings.github
  if (!github) return null
  if (!github.owner || !github.repository || !github.branch) {
    throw new Error('GitHub 图床配置不完整')
  }
  return github
}

/** Validates image storage settings before they are persisted. */
export function normalizeImageStorageSettings(settings: ImageStorageSettings): ImageStorageSettings {
  // Global directory is normalized only after the user has selected one.
  const globalDirectory = settings.globalDirectory ? resolve(settings.globalDirectory) : null
  // GitHub metadata is validated independently from the active mode.
  const github = normalizeGitHubSettings(settings)
  if (!(['relative', 'global', 'github'] as ImageStorageMode[]).includes(settings.mode)) {
    throw new Error('未知的图片保存模式')
  }
  if (settings.mode === 'global' && !globalDirectory) {
    throw new Error('请先选择全局图片目录')
  }
  if (settings.mode === 'github' && !github) {
    throw new Error('请先配置 GitHub 图床')
  }
  return {
    mode: settings.mode,
    relativeDirectory: normalizeRelativeImageDirectory(settings.relativeDirectory),
    globalDirectory,
    github
  }
}

/** Converts an image to the existing embedded fallback used by local storage modes. */
function embedImage(
  request: ImportImageRequest,
  fallbackReason: ImportImageResult['fallbackReason'],
  fallbackDescription?: string
): ImportImageResult {
  // Image MIME type is constrained before forming an embedded browser resource.
  const mimeType = request.mimeType.startsWith('image/') ? request.mimeType : 'image/png'
  return {
    src: `data:${mimeType};base64,${Buffer.from(request.data).toString('base64')}`,
    fileName: request.name,
    relativePath: null,
    storageMode: 'embedded',
    fallbackReason,
    fallbackDescription
  }
}

/** Imports an image through one local storage strategy while preserving Data URL fallback. */
async function importLocalImage(
  request: ImportImageRequest,
  mode: 'relative' | 'global'
): Promise<ImportImageResult> {
  if (!request.documentPath) return embedImage(request, 'unsaved-document')
  try {
    // Resolved document path must already belong to an authorized workspace or file.
    const documentPath = resolve(request.documentPath)
    if (!isAuthorized(documentPath)) throw new Error('文档不在授权范围内')
    // Document directory anchors relative image storage and Markdown paths.
    const documentDir = dirname(documentPath)
    // Current settings determine the authorized local destination.
    const settings = (await loadState()).imageStorage
    // Active local strategy selects either the global root or document-relative folder.
    const targetDir =
      mode === 'global'
        ? settings.globalDirectory
        : resolve(documentDir, normalizeRelativeImageDirectory(settings.relativeDirectory))
    if (!targetDir) throw new Error('请先选择全局图片目录')
    if (mode === 'relative' && !isInside(documentDir, targetDir)) {
      throw new Error('图片目录不能超出文档目录')
    }
    if (mode === 'global') setImageRoot(targetDir)
    return await importImage({
      name: request.name,
      data: request.data,
      targetDir,
      documentDir,
      storageMode: mode
    })
  } catch (error) {
    return embedImage(request, 'local-import-failed', String(error))
  }
}

/** Dispatches image imports through the active persisted storage strategy. */
export async function importStoredImage(request: ImportImageRequest): Promise<ImportImageResult> {
  // Persisted mode is read at import time so settings changes apply immediately.
  const mode = (await loadState()).imageStorage.mode
  // Fixed mode keys map directly to their corresponding storage behavior.
  const strategies: Record<ImageStorageMode, () => Promise<ImportImageResult>> = {
    relative: () => importLocalImage(request, 'relative'),
    global: () => importLocalImage(request, 'global'),
    github: () => uploadGitHubImage({ name: request.name, data: request.data })
  }
  return strategies[mode]()
}
