import { resolve, sep } from 'path'

const roots = new Set<string>()

function normalize(target: string): string {
  return resolve(target)
}

export function isInside(parent: string, child: string): boolean {
  const parentPath = normalize(parent)
  const childPath = normalize(child)
  return childPath === parentPath || childPath.startsWith(parentPath + sep)
}

export function addWorkspaceRoot(root: string): void {
  roots.clear()
  roots.add(normalize(root))
}

export function addFileRoot(filePath: string): void {
  roots.add(resolve(filePath, '..'))
}

export function clearFileRoots(): void {
  const workspaceRoot = [...roots].find((root) => root.length > 0)
  roots.clear()
  if (workspaceRoot) roots.add(workspaceRoot)
}

export function isAuthorized(target: string): boolean {
  const resolved = normalize(target)
  return [...roots].some((root) => isInside(root, resolved))
}

export function authorizedRoots(): string[] {
  return [...roots]
}
