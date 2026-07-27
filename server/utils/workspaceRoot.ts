import path from 'path';

export function getWorkspaceRoot(): string {
  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }

  return path.basename(process.cwd()).toLowerCase() === 'server'
    ? path.resolve(process.cwd(), '..')
    : path.resolve(process.cwd());
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
