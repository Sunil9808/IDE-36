import { Socket } from 'socket.io';
import os from 'os';
import { terminalManager } from '../terminal/terminalManager';

export function initTerminalSocket(socket: Socket): void {
  socket.on('terminal:create', (data: { sessionId: string; shell?: string; cwd?: string; cols?: number; rows?: number }) => {
    const { sessionId, shell, cwd, cols = 80, rows = 24 } = data;

    try {
      const resolvedShell = terminalManager.resolveShell(shell);
      const sessionInfo = terminalManager.createSession({
        sessionId,
        shell,
        cwd,
        cols,
        rows,
        socketId: socket.id,
        onData: (dataChunk) => {
          socket.emit('terminal:data', { sessionId, data: dataChunk });
        },
        onExit: (exitCode) => {
          socket.emit('terminal:closed', { sessionId, exitCode });
        },
      });

      socket.emit('terminal:created', {
        id: sessionInfo.id,
        name: resolvedShell.label,
        shell: sessionInfo.shell,
        cwd: sessionInfo.cwd,
        isConnected: true,
        pid: sessionInfo.pid,
      });

      console.log(`[Socket Terminal] Session created: ${sessionId} (Socket: ${socket.id})`);
    } catch (error: any) {
      console.error('[Socket Terminal] Creation error:', error);

      socket.emit('terminal:error', {
        sessionId,
        error: `Failed to create terminal PTY: ${error?.message || 'Unknown error'}`,
      });

      socket.emit('terminal:created', {
        id: sessionId,
        name: shell || 'fallback',
        shell: shell || '/bin/bash',
        cwd: cwd || os.homedir(),
        isConnected: false,
      });
    }
  });

  socket.on('terminal:data', (data: { sessionId: string; data: string }) => {
    if (data?.sessionId && typeof data.data === 'string') {
      terminalManager.writeToSession(data.sessionId, data.data);
    }
  });

  socket.on('terminal:resize', (data: { sessionId: string; cols: number; rows: number }) => {
    if (data?.sessionId && typeof data.cols === 'number' && typeof data.rows === 'number') {
      terminalManager.resizeSession(data.sessionId, data.cols, data.rows);
    }
  });

  socket.on('terminal:destroy', (data: { sessionId: string }) => {
    if (data?.sessionId) {
      terminalManager.destroySession(data.sessionId);
      socket.emit('terminal:closed', { sessionId: data.sessionId, exitCode: 0 });
    }
  });

  socket.on('terminal:kill', (data: { sessionId: string }) => {
    if (data?.sessionId) {
      terminalManager.destroySession(data.sessionId);
      socket.emit('terminal:closed', { sessionId: data.sessionId, exitCode: 1 });
    }
  });

  socket.on('disconnect', () => {
    terminalManager.cleanupSocketSessions(socket.id);
  });
}
