import path from 'path';
import fs from 'fs';
import { getIO } from '../socket/socketServer';
import { watchWorkspace } from './workspaceWatcher';

const SERVER_ROOT_FILE = path.resolve(__dirname, '../.workspace-root.txt');
const PROJECT_ROOT_FILE = path.resolve(__dirname, '../../.workspace-root.txt');

let activeWorkspaceRoot: string = '';

function getSavedWorkspacePath(): string | null {
  for (const file of [SERVER_ROOT_FILE, PROJECT_ROOT_FILE]) {
    try {
      if (fs.existsSync(file)) {
        const saved = fs.readFileSync(file, 'utf-8').trim();
        if (saved && fs.existsSync(saved)) {
          const stat = fs.statSync(saved);
          if (stat.isDirectory()) {
            return path.resolve(saved);
          }
        }
      }
    } catch {}
  }
  return null;
}

export function getDefaultWorkspaceRoot(): string {
  const ideRoot = path.resolve(__dirname, '../..');
  const configuredRoot = process.env.WORKSPACE_ROOT;
  const baseDir = configuredRoot
    ? path.isAbsolute(configuredRoot)
      ? configuredRoot
      : path.resolve(ideRoot, configuredRoot)
    : path.resolve(ideRoot, 'storage', 'workspaces');

  const defaultDir = path.resolve(baseDir, 'default');
  try {
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
  } catch (err) {
    console.warn(`Could not create default workspace at ${defaultDir}:`, err);
  }
  return defaultDir;
}

export function getWorkspaceRoot(): string {
  if (activeWorkspaceRoot && fs.existsSync(activeWorkspaceRoot)) {
    return activeWorkspaceRoot;
  }

  // 1. Try saved workspace from previous session
  const saved = getSavedWorkspacePath();
  if (saved) {
    activeWorkspaceRoot = saved;
  } else {
    // 2. Automatic default workspace
    activeWorkspaceRoot = getDefaultWorkspaceRoot();
  }

  // Ensure active workspace directory physically exists
  try {
    if (!fs.existsSync(activeWorkspaceRoot)) {
      fs.mkdirSync(activeWorkspaceRoot, { recursive: true });
    }
  } catch (err) {
    console.warn(`Could not ensure workspace root at ${activeWorkspaceRoot}:`, err);
  }

  // Start watching active workspace
  try {
    watchWorkspace(activeWorkspaceRoot);
  } catch {}

  return activeWorkspaceRoot;
}

export function setActiveWorkspaceRoot(newPath: string): string {
  if (!newPath || typeof newPath !== 'string') {
    throw new Error('Valid workspace path is required');
  }

  const resolved = path.resolve(newPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolved}`);
  }

  activeWorkspaceRoot = resolved;

  // Persist to root files
  try {
    fs.writeFileSync(SERVER_ROOT_FILE, resolved, 'utf-8');
    fs.writeFileSync(PROJECT_ROOT_FILE, resolved, 'utf-8');
  } catch (err) {
    console.warn('Could not persist workspace root to file:', err);
  }

  // Re-point backend file watcher
  try {
    watchWorkspace(resolved);
  } catch (err) {
    console.warn('Could not watch new workspace:', err);
  }

  // Emit event to all connected clients over Socket.IO
  try {
    const io = getIO();
    if (io) {
      const payload = {
        id: Buffer.from(resolved).toString('base64').slice(0, 16),
        name: path.basename(resolved),
        path: resolved,
        type: 'local',
      };
      io.emit('workspace:changed', payload);
      io.emit('fs:changed', { root: resolved });
    }
  } catch (err) {
    console.warn('Could not emit workspace change event:', err);
  }

  return activeWorkspaceRoot;
}

export const setWorkspaceRoot = setActiveWorkspaceRoot;

export function resolveWorkspacePath(requestedPath?: string, customRoot?: string): string {
  const root = path.resolve(customRoot || getWorkspaceRoot());
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

  // Reject paths that traverse outside the workspace or cross drive letters
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path is outside the workspace: ${requestedPath}`);
  }

  // Security check: ensure symlinks cannot escape the root
  try {
    let checkPart = resolved;
    while (checkPart && checkPart !== path.dirname(checkPart)) {
      if (fs.existsSync(checkPart)) {
        const real = fs.realpathSync(checkPart);
        const realRoot = fs.existsSync(root) ? fs.realpathSync(root) : root;
        const realRel = path.relative(realRoot, real);
        if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
          throw new Error(`Path escapes workspace via symlink: ${requestedPath}`);
        }
        break;
      }
      checkPart = path.dirname(checkPart);
    }
  } catch (err: any) {
    if (err.message?.includes('escapes workspace')) throw err;
  }

  return resolved;
}
