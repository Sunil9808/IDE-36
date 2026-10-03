import { Router, Request, Response } from 'express';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getWorkspaceRoot, resolveWorkspacePath } from '../utils/workspaceRoot';

const router = Router();

interface ManagedProcess {
  id: string;
  command: string;
  cwd: string;
  url?: string;
  pid?: number;
  child: ChildProcessWithoutNullStreams;
  startedAt: number;
  output: string[];
  status: 'starting' | 'running' | 'exited' | 'error';
}

interface ProjectDetection {
  type: string;
  framework: string;
  root: string;
  commands: {
    install?: string;
    build?: string;
    start?: string;
    dev?: string;
  };
  preview?: {
    kind: 'server' | 'html';
    url?: string;
    filePath?: string;
  };
}

const processes = new Map<string, ManagedProcess>();

function hasFile(root: string, fileName: string) {
  return fs.existsSync(path.join(root, fileName));
}

async function readJson(filePath: string): Promise<Record<string, any> | null> {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function getPackageManager(root: string) {
  if (hasFile(root, 'pnpm-lock.yaml')) return 'pnpm';
  if (hasFile(root, 'yarn.lock')) return 'yarn';
  return 'npm';
}

function packageCommand(manager: string, script: string) {
  if (manager === 'yarn') return `yarn ${script}`;
  if (manager === 'pnpm') return `pnpm ${script}`;
  return `npm run ${script}`;
}

async function detectProject(root: string): Promise<ProjectDetection> {
  const packageJson = await readJson(path.join(root, 'package.json'));
  const manager = getPackageManager(root);

  if (packageJson) {
    const scripts = packageJson.scripts || {};
    const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
    const framework = deps.next ? 'Next.js'
      : deps.vite || hasFile(root, 'vite.config.ts') || hasFile(root, 'vite.config.js') ? 'Vite'
      : deps.react ? 'React'
      : 'Node.js';

    return {
      type: framework.toLowerCase().replace('.', ''),
      framework,
      root,
      commands: {
        install: manager === 'npm' ? 'npm install' : `${manager} install`,
        build: scripts.build ? packageCommand(manager, 'build') : undefined,
        start: scripts.start ? (manager === 'npm' ? 'npm start' : `${manager} start`) : undefined,
        dev: scripts.dev ? packageCommand(manager, 'dev') : scripts.start ? (manager === 'npm' ? 'npm start' : `${manager} start`) : undefined,
      },
      preview: {
        kind: 'server',
        url: framework === 'Next.js' ? 'http://127.0.0.1:3000' : 'http://127.0.0.1:5173',
      },
    };
  }

  if (hasFile(root, 'app.py') || hasFile(root, 'main.py')) {
    const entry = hasFile(root, 'app.py') ? 'app.py' : 'main.py';
    return {
      type: 'python',
      framework: 'Python',
      root,
      commands: {
        start: `python ${entry}`,
        dev: `python ${entry}`,
      },
      preview: { kind: 'server', url: 'http://127.0.0.1:5000' },
    };
  }

  if (hasFile(root, 'index.php')) {
    return {
      type: 'php',
      framework: 'PHP',
      root,
      commands: {
        dev: 'php -S 127.0.0.1:8000',
      },
      preview: { kind: 'server', url: 'http://127.0.0.1:8000' },
    };
  }

  const htmlEntry = ['index.html', 'src/index.html', 'public/index.html']
    .map((candidate) => path.join(root, candidate))
    .find((candidate) => fs.existsSync(candidate));

  return {
    type: htmlEntry ? 'html' : 'unknown',
    framework: htmlEntry ? 'Static HTML' : 'Unknown',
    root,
    commands: {},
    preview: htmlEntry ? { kind: 'html', filePath: htmlEntry } : undefined,
  };
}

function appendOutput(processInfo: ManagedProcess, text: string) {
  processInfo.output.push(text);
  if (processInfo.output.length > 200) processInfo.output.splice(0, processInfo.output.length - 200);
}

router.get('/detect', async (req: Request, res: Response) => {
  try {
    const root = req.query.path ? resolveWorkspacePath(String(req.query.path)) : getWorkspaceRoot();
    res.json(await detectProject(root));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to detect project' });
  }
});

router.get('/processes', (_req: Request, res: Response) => {
  res.json(Array.from(processes.values()).map(({ child: _child, ...info }) => ({
    ...info,
    output: info.output.slice(-40).join(''),
  })));
});

router.post('/start', async (req: Request, res: Response) => {
  try {
    const root = req.body?.path ? resolveWorkspacePath(String(req.body.path)) : getWorkspaceRoot();
    const detection = await detectProject(root);
    const requestedCommand = typeof req.body?.command === 'string' ? req.body.command.trim() : '';
    const command = requestedCommand || detection.commands.dev || detection.commands.start;

    if (!command) {
      res.status(400).json({ error: `No runnable command detected for ${detection.framework}` });
      return;
    }

    const id = Math.random().toString(36).slice(2);
    const child = spawn(command, {
      cwd: root,
      shell: true,
      windowsHide: true,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        HOST: '127.0.0.1',
      },
    });

    const processInfo: ManagedProcess = {
      id,
      command,
      cwd: root,
      url: detection.preview?.url,
      pid: child.pid,
      child,
      startedAt: Date.now(),
      output: [],
      status: 'starting',
    };
    processes.set(id, processInfo);

    child.stdout.on('data', (chunk) => {
      processInfo.status = 'running';
      appendOutput(processInfo, chunk.toString());
    });
    child.stderr.on('data', (chunk) => {
      processInfo.status = 'running';
      appendOutput(processInfo, chunk.toString());
    });
    child.on('error', (error) => {
      processInfo.status = 'error';
      appendOutput(processInfo, error.message);
    });
    child.on('close', (code) => {
      processInfo.status = 'exited';
      appendOutput(processInfo, `\nProcess exited with code ${code ?? 0}\n`);
    });

    res.json({
      id,
      command,
      cwd: root,
      pid: child.pid,
      status: processInfo.status,
      url: detection.preview?.url,
      detection,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to start project' });
  }
});

router.post('/stop', (req: Request, res: Response) => {
  const id = String(req.body?.id || '');
  const processInfo = processes.get(id);
  if (!processInfo) {
    res.status(404).json({ error: 'Process not found' });
    return;
  }

  try {
    processInfo.child.kill();
    processInfo.status = 'exited';
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to stop process' });
  }
});

router.get('/html-preview', async (req: Request, res: Response) => {
  try {
    const filePath = resolveWorkspacePath(String(req.query.path || 'index.html'));
    const content = await fsp.readFile(filePath, 'utf-8');
    res.type('html').send(content);
  } catch (error) {
    res.status(404).send(error instanceof Error ? error.message : 'HTML preview not found');
  }
});

export default router;
