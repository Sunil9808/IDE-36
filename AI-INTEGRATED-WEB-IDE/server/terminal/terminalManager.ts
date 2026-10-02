import os from 'os';
import fs from 'fs';
import path from 'path';
import { getWorkspaceRoot, resolveWorkspacePath } from '../utils/workspaceRoot';

export interface PTYSessionInfo {
  id: string;
  socketId?: string;
  shell: string;
  cwd: string;
  pid?: number;
  createdAt: number;
  isConnected: boolean;
}

export interface CreateTerminalOptions {
  sessionId: string;
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  socketId?: string;
  onData?: (data: string) => void;
  onExit?: (code: number) => void;
}

export interface ResolvedShell {
  file: string;
  args: string[];
  label: string;
}

class TerminalManager {
  private sessions = new Map<string, {
    id: string;
    pty: any;
    socketId?: string;
    shell: string;
    cwd: string;
    pid?: number;
    createdAt: number;
    buffer: string;
    onDataListeners: Set<(data: string) => void>;
    onExitListeners: Set<(code: number) => void>;
  }>();

  private ptyModule: any = null;
  private ptyLoadAttempted = false;

  private getPtyModule() {
    if (!this.ptyLoadAttempted) {
      this.ptyLoadAttempted = true;
      try {
        this.ptyModule = require('node-pty');
      } catch (err) {
        console.warn('[TerminalManager] node-pty native module could not be loaded:', err);
        this.ptyModule = null;
      }
    }
    return this.ptyModule;
  }

  public resolveShell(requestedShell?: string): ResolvedShell {
    const requested = (requestedShell || '').trim();

    if (os.platform() !== 'win32') {
      const defaultShell = process.env.SHELL || '/bin/bash';
      const file = requested || defaultShell;
      return {
        file,
        args: [],
        label: path.basename(file),
      };
    }

    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';

    const candidates: Record<string, string[]> = {
      'powershell.exe': [
        `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
        'powershell.exe',
      ],
      powershell: [
        `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
        'powershell.exe',
      ],
      'pwsh.exe': ['pwsh.exe'],
      pwsh: ['pwsh.exe'],
      'cmd.exe': [`${systemRoot}\\System32\\cmd.exe`, 'cmd.exe'],
      cmd: [`${systemRoot}\\System32\\cmd.exe`, 'cmd.exe'],
      'wsl.exe': [`${systemRoot}\\System32\\wsl.exe`, 'wsl.exe'],
      wsl: [`${systemRoot}\\System32\\wsl.exe`, 'wsl.exe'],
      'bash.exe': [
        `${programFiles}\\Git\\bin\\bash.exe`,
        `${programFiles}\\Git\\usr\\bin\\bash.exe`,
        'bash.exe',
      ],
      bash: [
        `${programFiles}\\Git\\bin\\bash.exe`,
        `${programFiles}\\Git\\usr\\bin\\bash.exe`,
        'bash.exe',
      ],
      'node.exe': ['node.exe'],
      node: ['node.exe'],
    };

    const key = requested.toLowerCase();
    const lookup = candidates[key] || (requested ? [requested] : [candidates['powershell.exe'][0]]);

    const file = lookup.find((cand) => !cand.includes('\\') || fs.existsSync(cand)) || lookup[0];
    return {
      file,
      args: [],
      label: requested || path.basename(file, '.exe'),
    };
  }

  public resolveDirectory(requestedCwd?: string): string {
    const defaultRoot = getWorkspaceRoot();
    if (!requestedCwd || !requestedCwd.trim()) {
      return defaultRoot;
    }

    try {
      return resolveWorkspacePath(requestedCwd);
    } catch {
      if (fs.existsSync(requestedCwd) && fs.statSync(requestedCwd).isDirectory()) {
        return path.resolve(requestedCwd);
      }
      return defaultRoot;
    }
  }

  public createSession(options: CreateTerminalOptions): PTYSessionInfo {
    const { sessionId, shell, cwd, cols = 80, rows = 24, socketId, onData, onExit } = options;

    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (socketId) existing.socketId = socketId;
      if (onData) {
        existing.onDataListeners.add(onData);
        if (existing.buffer) {
          try {
            onData(existing.buffer);
          } catch (err) {
            console.error('[TerminalManager] Error replaying buffer:', err);
          }
        }
      }
      if (onExit) existing.onExitListeners.add(onExit);
      return {
        id: existing.id,
        socketId: existing.socketId,
        shell: existing.shell,
        cwd: existing.cwd,
        pid: existing.pid,
        createdAt: existing.createdAt,
        isConnected: true,
      };
    }

    const pty = this.getPtyModule();
    if (!pty) {
      throw new Error('node-pty is not installed or failed to load on this system.');
    }

    const resolvedShell = this.resolveShell(shell);
    const workDir = this.resolveDirectory(cwd);

    let ptyProcess: any;
    try {
      ptyProcess = pty.spawn(resolvedShell.file, resolvedShell.args, {
        name: 'xterm-256color',
        cols: Math.max(10, cols),
        rows: Math.max(5, rows),
        cwd: workDir,
        useConpty: true,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          FORCE_COLOR: '1',
        } as NodeJS.ProcessEnv,
      });
    } catch (err: any) {
      if (os.platform() === 'win32') {
        ptyProcess = pty.spawn(resolvedShell.file, resolvedShell.args, {
          name: 'xterm-256color',
          cols: Math.max(10, cols),
          rows: Math.max(5, rows),
          cwd: workDir,
          useConpty: false,
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            FORCE_COLOR: '1',
          } as NodeJS.ProcessEnv,
        });
      } else {
        throw err;
      }
    }

    const onDataListeners = new Set<(data: string) => void>();
    const onExitListeners = new Set<(code: number) => void>();

    if (onData) onDataListeners.add(onData);
    if (onExit) onExitListeners.add(onExit);

    const sessionObj = {
      id: sessionId,
      pty: ptyProcess,
      socketId,
      shell: resolvedShell.file,
      cwd: workDir,
      pid: ptyProcess.pid,
      createdAt: Date.now(),
      buffer: '',
      onDataListeners,
      onExitListeners,
    };

    this.sessions.set(sessionId, sessionObj);

    ptyProcess.onData((data: string) => {
      sessionObj.buffer = (sessionObj.buffer + data).slice(-50000);
      for (const listener of sessionObj.onDataListeners) {
        try {
          listener(data);
        } catch (e) {
          console.error('[TerminalManager] Error in data listener:', e);
        }
      }
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      console.log(`[TerminalManager] Process for session ${sessionId} exited with code ${exitCode}`);
      for (const listener of sessionObj.onExitListeners) {
        try {
          listener(exitCode);
        } catch (e) {
          console.error('[TerminalManager] Error in exit listener:', e);
        }
      }
      this.sessions.delete(sessionId);
    });

    console.log(`[TerminalManager] Created PTY session ${sessionId} (PID: ${ptyProcess.pid}, Shell: ${resolvedShell.file})`);

    return {
      id: sessionId,
      socketId,
      shell: resolvedShell.file,
      cwd: workDir,
      pid: ptyProcess.pid,
      createdAt: sessionObj.createdAt,
      isConnected: true,
    };
  }

  public writeToSession(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session && session.pty) {
      try {
        session.pty.write(data);
        return true;
      } catch (err) {
        console.error(`[TerminalManager] Error writing to session ${sessionId}:`, err);
      }
    }
    return false;
  }

  public resizeSession(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (session && session.pty) {
      try {
        session.pty.resize(Math.max(10, cols), Math.max(5, rows));
        return true;
      } catch (err) {
        console.error(`[TerminalManager] Error resizing session ${sessionId}:`, err);
      }
    }
    return false;
  }

  public destroySession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        if (session.pty) {
          session.pty.kill();
        }
      } catch (e) {
        console.error(`[TerminalManager] Error killing session ${sessionId}:`, e);
      }
      this.sessions.delete(sessionId);
      console.log(`[TerminalManager] Destroyed session ${sessionId}`);
      return true;
    }
    return false;
  }

  public cleanupSocketSessions(socketId: string): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.socketId === socketId) {
        this.destroySession(sessionId);
      }
    }
  }

  public getSession(sessionId: string): PTYSessionInfo | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      id: session.id,
      socketId: session.socketId,
      shell: session.shell,
      cwd: session.cwd,
      pid: session.pid,
      createdAt: session.createdAt,
      isConnected: true,
    };
  }

  public getSessions(): PTYSessionInfo[] {
    const result: PTYSessionInfo[] = [];
    for (const session of this.sessions.values()) {
      result.push({
        id: session.id,
        socketId: session.socketId,
        shell: session.shell,
        cwd: session.cwd,
        pid: session.pid,
        createdAt: session.createdAt,
        isConnected: true,
      });
    }
    return result;
  }

  public destroyAllSessions(): void {
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.destroySession(sessionId);
    }
  }

  public addDataListener(sessionId: string, listener: (data: string) => void): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.onDataListeners.add(listener);
      if (session.buffer) {
        try { listener(session.buffer); } catch {}
      }
      return true;
    }
    return false;
  }

  public removeDataListener(sessionId: string, listener: (data: string) => void): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.onDataListeners.delete(listener);
      return true;
    }
    return false;
  }
}

export const terminalManager = new TerminalManager();

// Process exit handlers to ensure zero orphaned PTY processes
const cleanup = () => {
  terminalManager.destroyAllSessions();
};
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

