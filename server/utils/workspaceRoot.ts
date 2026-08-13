import path from 'path';

import fs from 'fs';

const ROOT_FILE = path.resolve(process.cwd(), '.workspace-root.txt');

export function getWorkspaceRoot(): string {
  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }
  
  if (fs.existsSync(ROOT_FILE)) {
    const savedPath = fs.readFileSync(ROOT_FILE, 'utf-8').trim();
    if (savedPath && fs.existsSync(savedPath)) {
      return path.resolve(savedPath);
    }
  }

  // Fallback to home directory to prevent using the IDE's source folder
  const homeDir = process.env.USERPROFILE || process.env.HOME || process.cwd();
  return path.resolve(homeDir);
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
