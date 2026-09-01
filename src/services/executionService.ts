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

    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ai-web-ide:terminal-run', { detail: { command, fileName, cwd: workspace.path } }));
    }, 500);

    // Wait and reset state (in a real app, we would track process ID)
    setTimeout(() => {
       this.updateState(filePath, 'idle');
    }, 3000);
  }

  resolveCommand(lang: string, fileName: string): string {
    const baseName = fileName.split('.').slice(0, -1).join('.');
    
    // Use a small Node script to execute cross-platform commands where necessary
    // so we don't have to guess if the backend is Windows (.\main) or Linux (./main)
    const execCrossPlatform = (cmd: string) => `node -e "require('child_process').spawnSync('${cmd.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', {stdio: 'inherit', shell: true})"`;
    const runExecutable = (exeBase: string) => `node -e "const cp=require('child_process'); cp.spawnSync(process.platform==='win32'?'.\\\\${exeBase}.exe':'./${exeBase}', {stdio: 'inherit', shell: true})"`;

    switch (lang) {
      case 'python': return `python ${fileName}`;
      case 'javascript': return `node ${fileName}`;
      case 'java': return `javac ${fileName} && java ${baseName}`;
      case 'c': return `gcc ${fileName} -o ${baseName} && ${runExecutable(baseName)}`;
      case 'cpp': return `g++ ${fileName} -o ${baseName} && ${runExecutable(baseName)}`;
      case 'csharp': return `csc ${fileName} && ${runExecutable(baseName)}`;
      case 'go': return `go run ${fileName}`;
      case 'rust': return `rustc ${fileName} && ${runExecutable(baseName)}`;
      default: return `echo "Unsupported language"`;
    }
  }

  stop(filePath: string) {
    this.updateState(filePath, 'idle');
    window.dispatchEvent(new CustomEvent('ai-web-ide:terminal-stop'));
  }
}

export const executionService = new ExecutionManager();