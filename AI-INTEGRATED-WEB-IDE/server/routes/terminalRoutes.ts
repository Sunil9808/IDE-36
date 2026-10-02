import { Router, Request, Response } from 'express';
import { exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { terminalManager } from '../terminal/terminalManager';

const router = Router();

router.get('/sessions', (_req: Request, res: Response) => {
  res.json(terminalManager.getSessions());
});

router.post('/create', (req: Request, res: Response) => {
  try {
    const { shell, cwd, cols, rows } = req.body || {};
    const sessionId = Math.random().toString(36).slice(2);
    const sessionInfo = terminalManager.createSession({
      sessionId,
      shell,
      cwd,
      cols,
      rows,
    });
    res.json(sessionInfo);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to create terminal session' });
  }
});

router.post('/cwd', (req: Request, res: Response) => {
  try {
    const target = req.body?.target;
    const baseCwd = req.body?.cwd;
    
    let resolvedBase = terminalManager.resolveDirectory(baseCwd);
    let finalPath = resolvedBase;

    if (target && typeof target === 'string') {
      const requested = target.trim().replace(/^["']|["']$/g, '');
      if (requested === '~') {
        finalPath = os.homedir();
      } else {
        const candidate = path.isAbsolute(requested)
          ? path.resolve(requested)
          : path.resolve(resolvedBase, requested);
        
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          finalPath = candidate;
        } else {
          return res.status(400).json({ error: `Directory not found: ${requested}` });
        }
      }
    }

    res.json({ cwd: terminalManager.resolveDirectory(finalPath) });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Unable to resolve directory' });
  }
});

router.get('/userinfo', (_req: Request, res: Response) => {
  try {
    const userInfo = os.userInfo();
    res.json({ username: userInfo.username, hostname: os.hostname() });
  } catch {
    res.json({ username: 'user', hostname: 'local' });
  }
});

router.get('/gitinfo', (req: Request, res: Response) => {
  const cwd = terminalManager.resolveDirectory(req.query.cwd as string);

  exec('git rev-parse --abbrev-ref HEAD', { cwd, windowsHide: true }, (error, stdout) => {
    if (error) {
      return res.json({ branch: null, dirty: false });
    }
    const branch = stdout.trim();

    exec('git status --porcelain', { cwd, windowsHide: true }, (statusError, statusStdout) => {
      const dirty = !statusError && statusStdout.trim().length > 0;
      res.json({ branch, dirty });
    });
  });
});

// Real-time streaming terminal endpoint via SSE (Fallback mode when socket.io is unavailable)
router.post('/stream', (req: Request, res: Response) => {
  const command = String(req.body?.command || '').trim();
  if (!command) {
    res.status(400).json({ error: 'Command is required' });
    return;
  }

  const commandCwd = terminalManager.resolveDirectory(req.body?.cwd);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const writeEvent = (type: string, data: unknown) => {
    res.write(`data: ${JSON.stringify({ type, ...((typeof data === 'object' && data) ? data : { value: data }) })}\n\n`);
  };

  const child = spawn(command, {
    cwd: commandCwd,
    shell: true,
    windowsHide: true,
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      TERM: 'xterm-256color',
    },
  });

  let hasOutput = false;

  child.stdout?.on('data', (chunk: Buffer) => {
    hasOutput = true;
    writeEvent('stdout', { text: chunk.toString() });
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    hasOutput = true;
    writeEvent('stderr', { text: chunk.toString() });
  });

  child.on('error', (err) => {
    writeEvent('error', { text: err.message });
    writeEvent('exit', { code: 1 });
    res.end();
  });

  child.on('close', (code) => {
    if (!hasOutput) {
      writeEvent('stdout', { text: '(command completed with no output)\n' });
    }
    writeEvent('exit', { code: code ?? 0 });
    res.end();
  });

  req.on('close', () => {
    try { child.kill(); } catch {}
  });
});

router.post('/run', (req: Request, res: Response) => {
  const command = String(req.body?.command || '').trim();
  if (!command) {
    res.status(400).json({ error: 'Command is required' });
    return;
  }

  const commandCwd = terminalManager.resolveDirectory(req.body?.cwd);

  exec(command, {
    cwd: commandCwd,
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 5,
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR || '1',
    },
  }, (error, stdout, stderr) => {
    res.json({
      command,
      cwd: commandCwd,
      exitCode: typeof error?.code === 'number' ? error.code : 0,
      output: `${stdout || ''}${stderr || ''}` || '(command completed with no output)\n',
    });
  });
});

export default router;
