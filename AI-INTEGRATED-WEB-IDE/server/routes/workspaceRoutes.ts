import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { getWorkspaceRoot, setWorkspaceRoot, resolveWorkspacePath } from '../utils/workspaceRoot';
import os from 'os';

const router = Router();

router.get('/list-dir', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawPath = (req.query.path as string) || getWorkspaceRoot();
    let dirPath: string;
    try {
      dirPath = resolveWorkspacePath(rawPath);
    } catch (err: any) {
      res.status(403).json({ error: err.message });
      return;
    }

    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        res.status(400).json({ error: 'path is not a directory' });
        return;
      }
    } catch (err: any) {
      res.status(404).json({ error: 'directory not found' });
      return;
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    // Only return directories
    const directories = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
      
    // Get parent directory
    const parentPath = path.dirname(dirPath);
    const root = getWorkspaceRoot();
    
    // Don't return parent path if we're at or above the root
    let parentPathSafe: string | null = parentPath !== dirPath ? parentPath : null;
    if (parentPathSafe) {
      try {
         const resolvedParent = resolveWorkspacePath(parentPathSafe);
         parentPathSafe = resolvedParent;
      } catch (err) {
         parentPathSafe = null;
      }
    }
    
    res.json({
      currentPath: dirPath,
      parentPath: parentPathSafe,
      directories
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/pick-folder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { execSync } = require('child_process');
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $f = New-Object System.Windows.Forms.FolderBrowserDialog
      $f.ShowNewFolderButton = $true
      $f.RootFolder = "MyComputer"
      $result = $f.ShowDialog()
      if ($result -eq "OK") { Write-Output $f.SelectedPath }
    `;
    const path = execSync(`powershell -STA -NoProfile -Command "${psScript.replace(/\n/g, '; ')}"`, { encoding: 'utf-8' }).trim();
    if (path) {
      res.json({ path });
    } else {
      res.json({ canceled: true });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to open native dialog. Ensure the server is running in your interactive terminal.' });
  }
});

router.get('/current', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const root = getWorkspaceRoot();
    await fs.mkdir(root, { recursive: true });
    res.json({
      id: Buffer.from(root).toString('base64').slice(0, 16),
      name: path.basename(root),
      path: root,
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
    });
  } catch (error) { next(error); }
});

router.post('/set-root', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { path: newPath } = req.body;
    if (!newPath) { res.status(400).json({ error: 'path is required' }); return; }
    
    setWorkspaceRoot(newPath);
    const root = getWorkspaceRoot();
    
    res.json({
      id: Buffer.from(root).toString('base64').slice(0, 16),
      name: path.basename(root),
      path: root,
    });
  } catch (error) { next(error); }
});

router.get('/list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const root = getWorkspaceRoot();
    await fs.mkdir(root, { recursive: true });
    const entries = await fs.readdir(root, { withFileTypes: true });
    const workspaces = entries
      .filter(e => e.isDirectory())
      .map(e => ({
        id: Buffer.from(e.name).toString('base64').slice(0, 16),
        name: e.name,
        path: path.join(root, e.name),
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
      }));
    res.json(workspaces);
  } catch (error) { next(error); }
});

router.post('/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    
    let workspacePath: string;
    try {
      workspacePath = resolveWorkspacePath(name);
    } catch (err: any) {
      res.status(403).json({ error: err.message });
      return;
    }
    
    const root = getWorkspaceRoot();
    if (workspacePath === root) {
      res.status(400).json({ error: 'invalid workspace name' });
      return;
    }

    await fs.mkdir(workspacePath, { recursive: true });
    
    // Create default files
    await fs.writeFile(path.join(workspacePath, 'README.md'), `# ${name}\n\nA new project.\n`);
    await fs.writeFile(
      path.join(workspacePath, 'package.json'),
      JSON.stringify({
        name,
        version: "1.0.0",
        scripts: { start: "node src/index.ts", dev: "ts-node src/index.ts" },
        dependencies: {}
      }, null, 2)
    );
    await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true });
    await fs.writeFile(path.join(workspacePath, 'src', 'index.ts'), `// ${name} - main entry point\n\nconsole.log('Hello from ${name}!');\n`);

    res.json({
      id: Buffer.from(name).toString('base64').slice(0, 16),
      name,
      path: workspacePath,
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
    });
  } catch (error) { next(error); }
});

router.post('/open', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { path: wsPath } = req.body;
    if (!wsPath) { res.status(400).json({ error: 'path is required' }); return; }
    
    // Auto-update workspace root to the opened directory
    setWorkspaceRoot(wsPath);
    
    const name = path.basename(wsPath);
    res.json({
      id: Buffer.from(wsPath).toString('base64').slice(0, 16),
      name,
      path: wsPath,
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
    });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'workspace id is required' });
      return;
    }
    
    const root = getWorkspaceRoot();
    
    // The frontend doesn't actually call this route currently, but the list API 
    // returns a 16-char base64 encoded string as the ID. Try to find the directory 
    // by ID first.
    let targetPath: string | null = null;
    
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      const targetEntry = entries.find(e => 
        e.isDirectory() && Buffer.from(e.name).toString('base64').slice(0, 16) === id
      );
      if (targetEntry) {
        targetPath = path.join(root, targetEntry.name);
      }
    } catch (err) {
      // root might not exist yet, ignore
    }

    // Fallback: If not found by ID, assume the ID might be the folder name/path
    if (!targetPath) {
      try {
        targetPath = resolveWorkspacePath(id);
      } catch (err: any) {
        res.status(403).json({ error: err.message });
        return;
      }
    }

    if (targetPath === root) {
      res.status(403).json({ error: 'Cannot delete the workspace root' });
      return;
    }

    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isDirectory()) {
         res.status(400).json({ error: 'target is not a workspace directory' });
         return;
      }
    } catch (err: any) {
      res.status(404).json({ error: 'workspace not found' });
      return;
    }

    await fs.rm(targetPath, { recursive: true, force: true });
    res.json({ success: true });
  } catch (error) { next(error); }
});

export default router;
