import { resolve, sep } from 'path'

// 当前工作区根目录在切换工作区时被替换。
let workspaceRoot: string | null = null
// 单独打开文件的目录在工作区切换后继续保持授权。
const fileRoots = new Set<string>()
// Image root remains authorized when the active workspace changes.
let imageRoot: string | null = null

/** 将路径转换为可比较的绝对路径。 */
function normalize(target: string): string {
  return resolve(target)
}

/** 判断目标路径是否位于指定目录中。 */
export function isInside(parent: string, child: string): boolean {
  // 父目录路径用于匹配目录本身及其子路径。
  const parentPath = normalize(parent)
  // 目标路径统一解析后参与授权判断。
  const childPath = normalize(child)
  return childPath === parentPath || childPath.startsWith(parentPath + sep)
}

/** 替换当前工作区根目录授权。 */
export function addWorkspaceRoot(root: string): void {
  workspaceRoot = normalize(root)
}

/** 授权单独打开文件所在的目录。 */
export function addFileRoot(filePath: string): void {
  fileRoots.add(resolve(filePath, '..'))
}

/** 清除全部单独打开文件的目录授权。 */
export function clearFileRoots(): void {
  fileRoots.clear()
}

/** 替换独立持久化的全局图片目录授权。 */
export function setImageRoot(root: string | null): void {
  imageRoot = root ? normalize(root) : null
}

/** 判断目标路径是否位于任一已授权目录中。 */
export function isAuthorized(target: string): boolean {
  // 目标路径统一解析后依次匹配三类授权目录。
  const resolved = normalize(target)
  return (
    (imageRoot !== null && isInside(imageRoot, resolved)) ||
    (workspaceRoot !== null && isInside(workspaceRoot, resolved)) ||
    [...fileRoots].some((root) => isInside(root, resolved))
  )
}

/** 返回当前全部已授权的根目录。 */
export function authorizedRoots(): string[] {
  return [workspaceRoot, ...fileRoots, imageRoot].filter((root): root is string => root !== null)
}
