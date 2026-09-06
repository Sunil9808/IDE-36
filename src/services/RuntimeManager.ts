import { terminalService } from './terminalService';

export interface RuntimeDiagnostic {
  id: string;
  name: string;
  command: string;
  status: 'checking' | 'available' | 'unavailable';
  version?: string;
  path?: string;
}

class RuntimeManager {
  private runtimes: Map<string, RuntimeDiagnostic> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.initDefaultRuntimes();
  }

  private initDefaultRuntimes() {
    this.addRuntime({ id: 'node', name: 'Node.js', command: 'node --version' });
    this.addRuntime({ id: 'python', name: 'Python', command: 'python --version' });
    this.addRuntime({ id: 'java', name: 'Java', command: 'java -version' });
    this.addRuntime({ id: 'gcc', name: 'C/C++ Compiler', command: 'gcc --version' });
    this.addRuntime({ id: 'go', name: 'Go', command: 'go version' });
    this.addRuntime({ id: 'rustc', name: 'Rust', command: 'rustc --version' });
  }

  addRuntime(runtime: Omit<RuntimeDiagnostic, 'status'>) {
    this.runtimes.set(runtime.id, { ...runtime, status: 'checking' });
    this.checkRuntime(runtime.id);
  }

  getRuntimes(): RuntimeDiagnostic[] {
    return Array.from(this.runtimes.values());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  async checkRuntime(id: string) {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;

    runtime.status = 'checking';
    this.notify();

    const sessionId = `rt-check-${id}-${Date.now()}`;
    terminalService.createSession(sessionId, 'bash', '/');

    let output = '';
    const onData = (data: { sessionId: string; data: string }) => {
      if (data.sessionId === sessionId) {
        output += data.data;
      }
    };

    terminalService.onData(onData);
    terminalService.sendData(sessionId, `${runtime.command}\n`);

    setTimeout(() => {
       terminalService.sendData(sessionId, 'exit\n');
    }, 500);

    // Wait for output to settle
    setTimeout(() => {
       terminalService.destroySession(sessionId);
       
       const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
       // Check if the command was actually run and didn't result in "command not found"
       const isNotFound = lines.some(l => l.includes('command not found') || l.includes('not recognized'));
       
       if (isNotFound || output.length === 0) {
          runtime.status = 'unavailable';
       } else {
          runtime.status = 'available';
          // Very naive version extraction
          const versionLine = lines.find(l => /[0-9]+\.[0-9]+/.test(l));
          if (versionLine) {
             runtime.version = versionLine;
          }
       }
       
       this.runtimes.set(id, runtime);
       this.notify();
    }, 1500);
  }
  
  checkAll() {
    for (const id of this.runtimes.keys()) {
      this.checkRuntime(id);
    }
  }
}

export const runtimeManager = new RuntimeManager();
