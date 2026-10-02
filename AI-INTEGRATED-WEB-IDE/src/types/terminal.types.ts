export type TerminalProfile = 'PowerShell' | 'Command Prompt' | 'Git Bash' | 'WSL' | 'Bash' | 'Node.js';

export interface TerminalSession {
  id: string;
  name: string;
  pid?: number;
  shell: string;
  profile: TerminalProfile;
  cwd: string;
  isActive: boolean;
  isConnected: boolean;
  status: 'connecting' | 'connected' | 'fallback' | 'exited' | 'error';
  statusMessage?: string;
  rows?: number;
  cols?: number;
  createdAt: number;
}

export interface TerminalCommand {
  id: string;
  command: string;
  output: string;
  exitCode?: number;
  timestamp: number;
  duration?: number;
}

export interface TerminalConfig {
  shell: string;
  cwd: string;
  env?: Record<string, string>;
  cols: number;
  rows: number;
}

export interface TerminalOutput {
  sessionId: string;
  data: string;
  type: 'stdout' | 'stderr';
  timestamp: number;
}

export type TerminalEvent = 
  | { type: 'data'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'exit'; code: number }
  | { type: 'error'; message: string };
