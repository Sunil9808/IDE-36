import { io, Socket } from 'socket.io-client';
import { TerminalSession } from '../types/terminal.types';

type DataCallback = (data: { sessionId: string; data: string }) => void;
type SessionCreatedCallback = (session: TerminalSession) => void;
type SessionClosedCallback = (data: { sessionId: string; exitCode?: number }) => void;
type ErrorCallback = (data: { sessionId: string; error: string }) => void;

class TerminalService {
  private socket: Socket | null = null;
  private dataListeners = new Set<DataCallback>();
  private createdListeners = new Set<SessionCreatedCallback>();
  private closedListeners = new Set<SessionClosedCallback>();
  private errorListeners = new Set<ErrorCallback>();

  connect(): Socket {
    if (!this.socket) {
      const isDev = typeof window !== 'undefined' && (window.location.port === '3000' || window.location.port === '3001' || window.location.port === '5173');
      const targetUrl = isDev ? `${window.location.protocol}//${window.location.hostname}:5000` : '/';

      this.socket = io(targetUrl, {
        transports: ['websocket', 'polling'],
        path: '/socket.io',
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 500,
      });

      this.socket.on('terminal:data', (data) => {
        this.dataListeners.forEach((cb) => {
          try { cb(data); } catch (e) { console.error('Error in terminal:data listener', e); }
        });
      });

      this.socket.on('terminal:created', (session) => {
        this.createdListeners.forEach((cb) => {
          try { cb(session); } catch (e) { console.error('Error in terminal:created listener', e); }
        });
      });

      this.socket.on('terminal:closed', (data) => {
        this.closedListeners.forEach((cb) => {
          try { cb(data); } catch (e) { console.error('Error in terminal:closed listener', e); }
        });
      });

      this.socket.on('terminal:error', (data) => {
        this.errorListeners.forEach((cb) => {
          try { cb(data); } catch (e) { console.error('Error in terminal:error listener', e); }
        });
      });
    }
    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  createSession(options: { sessionId: string; shell?: string; cwd?: string; cols?: number; rows?: number }): void {
    this.connect().emit('terminal:create', options);
  }

  destroySession(sessionId: string): void {
    this.connect().emit('terminal:destroy', { sessionId });
  }

  killSession(sessionId: string): void {
    this.connect().emit('terminal:kill', { sessionId });
  }

  sendData(sessionId: string, data: string): void {
    this.connect().emit('terminal:data', { sessionId, data });
  }

  resizeTerminal(sessionId: string, cols: number, rows: number): void {
    this.connect().emit('terminal:resize', { sessionId, cols, rows });
  }

  onData(callback: DataCallback): () => void {
    this.connect();
    this.dataListeners.add(callback);
    return () => {
      this.dataListeners.delete(callback);
    };
  }

  onSessionCreated(callback: SessionCreatedCallback): () => void {
    this.connect();
    this.createdListeners.add(callback);
    return () => {
      this.createdListeners.delete(callback);
    };
  }

  onSessionClosed(callback: SessionClosedCallback): () => void {
    this.connect();
    this.closedListeners.add(callback);
    return () => {
      this.closedListeners.delete(callback);
    };
  }

  onError(callback: ErrorCallback): () => void {
    this.connect();
    this.errorListeners.add(callback);
    return () => {
      this.errorListeners.delete(callback);
    };
  }
}

export const terminalService = new TerminalService();
