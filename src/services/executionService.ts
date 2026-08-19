import { terminalService } from './terminalService';
import { fileService } from './fileService';
import { useUIStore } from '../store/uiStore';
import { useWorkspaceStore } from '../store/workspaceStore';

export type ExecutionState = 'idle' | 'running' | 'completed' | 'error';

class ExecutionManager {
  private currentSessionId: string | null = null;
  private onStateChangeMap: Map<string, (state: ExecutionState) => void> = new Map();
  private states: Map<string, ExecutionState> = new Map();

  subscribe(filePath: string, handler: (state: ExecutionState) => void) {
    this.onStateChangeMap.set(filePath, handler);
  }

  unsubscribe(filePath: string) {
    this.onStateChangeMap.delete(filePath);
  }

  private updateState(filePath: string, state: ExecutionState) {
    this.states.set(filePath, state);
    const handler = this.onStateChangeMap.get(filePath);
    if (handler) handler(state);
  }

  getState(filePath: string): ExecutionState {
    return this.states.get(filePath) || 'idle';
  }

  detectLanguage(fileName: string): string | null {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py': return 'python';
      case 'js': return 'javascript';
      case 'java': return 'java';
      case 'c': return 'c';
      case 'cpp': return 'cpp';
      case 'cs': return 'csharp';
      case 'go': return 'go';
      case 'rs': return 'rust';
      default: return null;
    }
  }

  isFrameworkFile(fileName: string): boolean {
    const fwFiles = ['App.jsx', 'App.tsx', 'main.jsx', 'main.tsx', 'page.tsx', 'app.component.ts', 'Controller.java'];
    return fwFiles.includes(fileName);
  }

  async runFile(filePath: string, content: string) {
    if (this.getState(filePath) === 'running') return;

    const fileName = filePath.split('/').pop() || '';
    
    if (this.isFrameworkFile(fileName)) {
       // Run project logic
       this.runProject();
       return;
    }

    const lang = this.detectLanguage(fileName);
    if (!lang) {
      console.warn('Language not supported for standalone execution');
      return;
    }

    // Ensure saved
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) return;
    
    const absolutePath = `${workspace.path}/${filePath}`;
    await fileService.writeFile(absolutePath, content);

    // Open terminal panel
    useUIStore.getState().setBottomPanelVisible(true);
    useUIStore.getState().setActiveBottomPanel('terminal');

    this.updateState(filePath, 'running');
    
    this.currentSessionId = `exec-${Date.now()}`;
    const command = this.resolveCommand(lang, fileName);

    // Create session (uses Bash or PowerShell depending on backend OS)
    terminalService.createSession('/bin/bash', workspace.path); 
    // Wait for session... we can just use a delay for now, since we don't have custom ID mapping easily
    
    setTimeout(() => {
        // Send command
        // \x03 is Ctrl+C in case something is running
        const runCmd = `echo "\\x1b[32m▶ Running ${fileName}...\\x1b[0m" && ${command}`;
        terminalService.sendData('default', `${runCmd}\r`);
    }, 500);

    // Fake completion for UI state
    setTimeout(() => {
       this.updateState(filePath, 'idle');
    }, 3000);
  }

  async runProject() {
     const workspace = useWorkspaceStore.getState().workspace;
     if (!workspace) return;
     useUIStore.getState().setBottomPanelVisible(true);
     useUIStore.getState().setActiveBottomPanel('terminal');
     
     // Guess command based on project type. Let's just default to npm run dev
     setTimeout(() => {
        terminalService.sendData('default', `npm run dev\r`);
     }, 500);
  }

  resolveCommand(lang: string, fileName: string): string {
    const baseName = fileName.split('.').slice(0, -1).join('.');
    switch (lang) {
      case 'python': return `python ${fileName}`;
      case 'javascript': return `node ${fileName}`;
      case 'java': return `javac ${fileName} && java ${baseName}`;
      case 'c': return `gcc ${fileName} -o ${baseName} && ./${baseName}`;
      case 'cpp': return `g++ ${fileName} -o ${baseName} && ./${baseName}`;
      case 'csharp': return `csc ${fileName} && ./${baseName}.exe`;
      case 'go': return `go run ${fileName}`;
      case 'rust': return `rustc ${fileName} && ./${baseName}`;
      default: return `echo "Unsupported language"`;
    }
  }

  stop(filePath: string) {
    this.updateState(filePath, 'idle');
    terminalService.sendData('default', '\x03'); // Send Ctrl+C
    terminalService.sendData('default', `echo "\\nProcess stopped by user"\r`);
  }
}

export const executionService = new ExecutionManager();