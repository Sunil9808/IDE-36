import axios from 'axios';
import { FileNode, FileContent } from '../types/file.types';
import { useWorkspaceStore } from '../store/workspaceStore';

const BASE_URL = '/api';

// Helper to get local directory handle
const getDirHandle = () => useWorkspaceStore.getState().dirHandle;

// Ignored directories for local file tree
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  '__pycache__', '.venv', 'venv', '.DS_Store', 'coverage',
]);

function generateId(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str))).replace(/=/g, '');
  } catch (e) {
    return str.replace(/[^a-zA-Z0-9]/g, '_');
  }
}

// Helper to resolve a file or directory handle from a path string
async function resolveHandle(rootHandle: any, fullPath: string, isFile: boolean, create = false) {
  const workspacePath = useWorkspaceStore.getState().workspace?.path || '';
  // Remove workspace root path from the full path to get relative path
  let relPath = fullPath.startsWith(workspacePath) ? fullPath.slice(workspacePath.length) : fullPath;
  relPath = relPath.replace(/^[\\/]+/, ''); // remove leading slashes
  
  if (!relPath) return rootHandle; // root directory

  const parts = relPath.split(/[\\/]/).filter(Boolean);
  let current = rootHandle;

  let failingPart = '';
  try {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      failingPart = part;
      if (i === parts.length - 1 && isFile) {
        return await current.getFileHandle(part, { create });
      }
      let nextHandle;
      try {
        nextHandle = await current.getDirectoryHandle(part, { create });
      } catch (err: any) {
        if (err.name === 'NotFoundError' && create) {
          // Chrome File System API bug: if a folder was recently deleted on the OS side, 
          // Chrome's cache gets out of sync and throws NotFoundError even when create: true.
          // Forcing an iteration over the directory's entries clears the stale cache.
          for await (const _ of (current as any).values()) { /* ignore */ }
          
          await new Promise(r => setTimeout(r, 50));
          nextHandle = await current.getDirectoryHandle(part, { create });
        } else {
          throw err;
        }
      }
      current = nextHandle;
    }
    return current;
  } catch (err: any) {
    throw new Error(`[resolveHandle Error] path: '${fullPath}', workspace: '${workspacePath}', rel: '${relPath}', parts: ${JSON.stringify(parts)}, failed on part '${failingPart}': ${err.name} - ${err.message}`);
  }
}

// Helper to build file tree recursively from a directory handle
async function buildLocalTree(dirHandle: any, currentPath: string, depth = 0): Promise<FileNode[]> {
  if (depth > 8) return [];
  
  const nodes: FileNode[] = [];
  try {
    for await (const entry of dirHandle.values()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;

      const fullPath = `${currentPath}/${entry.name}`;
      const isDir = entry.kind === 'directory';

      const node: FileNode = {
        id: generateId(fullPath).replace(/=/g, ''), // safe ID
        name: entry.name,
        path: fullPath,
        type: isDir ? 'directory' : 'file',
        extension: isDir ? undefined : entry.name.split('.').pop()?.toLowerCase(),
      };

      if (isDir) {
        node.children = await buildLocalTree(entry, fullPath, depth + 1);
      } else {
        // optionally get file size/modified if needed
        try {
          const fileData = await entry.getFile();
          node.size = fileData.size;
          node.lastModified = fileData.lastModified;
        } catch (e) {}
      }

      nodes.push(node);
    }

    // Sort: directories first, then files
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    console.error('Error reading local directory:', err);
    return nodes;
  }
}

export const fileService = {
  async getFileTree(workspacePath: string): Promise<FileNode[]> {
    const handle = getDirHandle();
    if (handle) {
      return await buildLocalTree(handle, workspacePath);
    }
    const { data } = await axios.get(`${BASE_URL}/files/tree`, {
      params: { path: workspacePath },
    });
    return data;
  },

  async readFile(filePath: string): Promise<FileContent> {
    const handle = getDirHandle();
    if (handle) {
      const fileHandle = await resolveHandle(handle, filePath, true);
      const file = await fileHandle.getFile();
      const content = await file.text();
      return { content, encoding: 'utf8' };
    }
    const { data } = await axios.get(`${BASE_URL}/files/read`, {
      params: { path: filePath },
    });
    return data;
  },

  async writeFile(filePath: string, content: string): Promise<void> {
    const handle = getDirHandle();
    if (handle) {
      let fileHandle;
      try {
        fileHandle = await resolveHandle(handle, filePath, true, true);
      } catch (e: any) {
        throw new Error(`[writeFile.resolve] ${filePath}: ${e.name} - ${e.message}`);
      }
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return;
      } catch (e: any) {
        throw new Error(`[writeFile.write] ${filePath}: ${e.name} - ${e.message}`);
      }
    }
    await axios.post(`${BASE_URL}/files/write`, { path: filePath, content });
  },

  async createFile(filePath: string, content = ''): Promise<FileNode> {
    const handle = getDirHandle();
    if (handle) {
      const fileHandle = await resolveHandle(handle, filePath, true, true);
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      const file = await fileHandle.getFile();
      const name = fileHandle.name;
      return {
        id: generateId(filePath).replace(/=/g, ''),
        name,
        path: filePath,
        type: 'file',
        extension: name.split('.').pop()?.toLowerCase(),
        size: file.size,
        lastModified: file.lastModified,
      };
    }
    const { data } = await axios.post(`${BASE_URL}/files/create`, {
      path: filePath,
      content,
      type: 'file',
    });
    return data;
  },

  async createFolder(folderPath: string): Promise<FileNode> {
    const handle = getDirHandle();
    if (handle) {
      try {
        const dirHandle = await resolveHandle(handle, folderPath, false, true);
        const name = dirHandle.name;
        return {
          id: generateId(folderPath).replace(/=/g, ''),
          name,
          path: folderPath,
          type: 'directory',
          children: [],
        };
      } catch (e: any) {
        throw new Error(`[createFolder] ${folderPath}: ${e.name} - ${e.message}`);
      }
    }
    const { data } = await axios.post(`${BASE_URL}/files/create`, {
      path: folderPath,
      type: 'directory',
    });
    return data;
  },

  async deleteFile(filePath: string): Promise<void> {
    const handle = getDirHandle();
    if (handle) {
      const workspacePath = useWorkspaceStore.getState().workspace?.path || '';
      let relPath = filePath.startsWith(workspacePath) ? filePath.slice(workspacePath.length) : filePath;
      relPath = relPath.replace(/^[\\/]+/, '');
      
      const parts = relPath.split(/[\\/]/).filter(Boolean);
      const parentParts = parts.slice(0, -1);
      const targetName = parts[parts.length - 1];
      
      let current = handle;
      for (const part of parentParts) {
        current = await current.getDirectoryHandle(part);
      }
      // removeEntry works for both files and empty directories
      await current.removeEntry(targetName, { recursive: true });
      return;
    }
    await axios.delete(`${BASE_URL}/files/delete`, {
      data: { path: filePath },
    });
  },

  async renameFile(oldPath: string, newPath: string): Promise<FileNode> {
    // The File System Access API does not natively support renaming directly yet in all browsers.
    // A robust local rename requires copy + delete. 
    // For simplicity, we fall back to copy/delete if handle is used.
    const handle = getDirHandle();
    if (handle) {
      // 1. Read old file
      const oldHandle = await resolveHandle(handle, oldPath, true);
      const file = await oldHandle.getFile();
      const content = await file.text();
      // 2. Write new file
      const newHandle = await resolveHandle(handle, newPath, true, true);
      const writable = await newHandle.createWritable();
      await writable.write(content);
      await writable.close();
      // 3. Delete old file
      await this.deleteFile(oldPath);
      
      return {
        id: generateId(newPath).replace(/=/g, ''),
        name: newHandle.name,
        path: newPath,
        type: 'file',
        extension: newHandle.name.split('.').pop()?.toLowerCase(),
      };
    }
    const { data } = await axios.put(`${BASE_URL}/files/rename`, {
      oldPath,
      newPath,
    });
    return data;
  },

  async searchFiles(query: string, workspacePath: string): Promise<FileNode[]> {
    const handle = getDirHandle();
    if (handle) {
      const results: FileNode[] = [];
      const lowerQuery = query.toLowerCase();
      async function search(dirHandle: any, currentPath: string) {
        for await (const entry of dirHandle.values()) {
          if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
          const fullPath = `${currentPath}/${entry.name}`;
          if (entry.name.toLowerCase().includes(lowerQuery)) {
            results.push({
              id: generateId(fullPath).replace(/=/g, ''),
              name: entry.name,
              path: fullPath,
              type: entry.kind === 'directory' ? 'directory' : 'file',
              extension: entry.kind === 'file' ? entry.name.split('.').pop()?.toLowerCase() : undefined,
            });
          }
          if (entry.kind === 'directory') await search(entry, fullPath);
          if (results.length >= 50) return;
        }
      }
      await search(handle, workspacePath);
      return results;
    }
    const { data } = await axios.get(`${BASE_URL}/files/search`, {
      params: { query, path: workspacePath },
    });
    return data;
  },

  getLanguageFromExtension(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', rb: 'ruby', java: 'java', cpp: 'cpp', c: 'c',
      cs: 'csharp', go: 'go', rs: 'rust', php: 'php', swift: 'swift',
      kt: 'kotlin', html: 'html', css: 'css', scss: 'scss', less: 'less',
      json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml', md: 'markdown',
      sh: 'shell', bash: 'shell', sql: 'sql', dockerfile: 'dockerfile',
      toml: 'toml', ini: 'ini', env: 'plaintext', txt: 'plaintext',
    };
    return langMap[ext] || 'plaintext';
  },
};
