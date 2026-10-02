import path from 'path';

import fs from 'fs';

const ROOT_FILE = path.resolve(process.cwd(), '.workspace-root.txt');

export function getWorkspaceRoot(): string {
  let root = '';
  if (process.env.WORKSPACE_ROOT) {
    root = path.resolve(process.env.WORKSPACE_ROOT);
  } else if (fs.existsSync(ROOT_FILE)) {
    const savedPath = fs.readFileSync(ROOT_FILE, 'utf-8').trim();
    if (savedPath && fs.existsSync(savedPath)) {
      root = path.resolve(savedPath);
    }
  }

  if (!root) {
    const homeDir = process.env.USERPROFILE || process.env.HOME || process.cwd();
    root = path.resolve(homeDir);
  }

  // Ensure workspace directory exists on disk to prevent ENOENT crashes
  try {
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
    }
  } catch (err) {
    console.warn(`Could not create workspace root at ${root}, using cwd`, err);
    root = process.cwd();
  }

  return root;
}

export function setWorkspaceRoot(newPath: string): void {
  const resolved = path.resolve(newPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }
  fs.writeFileSync(ROOT_FILE, resolved, 'utf-8');
}

export function resolveWorkspacePath(requestedPath?: string): string {
  const root = getWorkspaceRoot();
  const requested = requestedPath?.trim();

  if (!requested || requested === '/workspace') {
    return root;
  }

  // Strip virtual prefix mapping used by frontend client-side routing
  const virtualWorkspacePrefix = /^[/\\](workspace|local-folder|cloned)(?:[/\\]|$)/i;
  const normalizedRequested = virtualWorkspacePrefix.test(requested)
    ? requested.replace(virtualWorkspacePrefix, '')
    : requested;

  const resolved = path.isAbsolute(normalizedRequested)
    ? path.resolve(normalizedRequested)
    : path.resolve(root, normalizedRequested);
  const relative = path.relative(root, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path is outside the workspace: ${requestedPath}`);
  }

  return resolved;
}
