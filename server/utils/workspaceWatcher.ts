import fs from 'fs';
import path from 'path';
import { getIO } from '../socket/socketServer';

let currentWatcher: fs.FSWatcher | null = null;
let currentWatchedRoot: string | null = null;
let debounceTimer: NodeJS.Timeout | null = null;

const IGNORED_NAMES = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', '__pycache__', '.workspace-root.txt']);

export function watchWorkspace(targetRoot: string): void {
  const resolved = path.resolve(targetRoot);

  if (currentWatchedRoot === resolved && currentWatcher) {
    return;
  }

  stopWatchingWorkspace();

  if (!fs.existsSync(resolved)) {
    return;
  }

  currentWatchedRoot = resolved;

  try {
    currentWatcher = fs.watch(resolved, { recursive: true }, (_eventType, filename) => {
      if (filename) {
        const parts = filename.split(/[\\/]/);
        if (parts.some((p) => IGNORED_NAMES.has(p) || p.startsWith('.'))) {
          return;
        }
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        try {
          const io = getIO();
          if (io) {
            io.emit('fs:changed', { root: resolved, filename });
          }
        } catch {}
      }, 150);
    });

    currentWatcher.on('error', (err) => {
      console.warn(`[WorkspaceWatcher] Error watching ${resolved}:`, err.message);
    });
  } catch (err: any) {
    console.warn(`[WorkspaceWatcher] Failed to start watcher on ${resolved}:`, err.message);
  }
}

export function stopWatchingWorkspace(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (currentWatcher) {
    try {
      currentWatcher.close();
    } catch {}
    currentWatcher = null;
  }
  currentWatchedRoot = null;
}
