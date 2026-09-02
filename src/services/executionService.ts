import { fileService } from './fileService';
import { useUIStore } from '../store/uiStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { detectLanguageFromExtension } from './execution/LanguageRegistry';
import { ExecutionResolver } from './execution/ExecutionResolver';

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
    const lang = detectLanguageFromExtension(fileName);
    return lang ? lang.id : null;
  }

  isFrameworkFile(fileName: string): boolean {
    const fwFiles = ['App.jsx', 'App.tsx', 'main.jsx', 'main.tsx', 'page.tsx', 'app.component.ts', 'Controller.java', 'package.json'];
    return fwFiles.includes(fileName);
  }

  async runFile(filePath: string, content: string) {
    if (this.getState(filePath) === 'running') return;

    const fileName = filePath.split('/').pop() || '';
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) return;
    
    const isProject = this.isFrameworkFile(fileName);
    const langCap = detectLanguageFromExtension(fileName);

    if (langCap?.executionMode === 'browser-preview') {
      useUIStore.getState().setBottomPanelVisible(true);
      useUIStore.getState().setActiveBottomPanel('preview');
      window.dispatchEvent(new CustomEvent('ai-web-ide:start-preview'));
      return;
    }

    if (isProject) {
      const projectCmd = await ExecutionResolver.getProjectRunCommand(workspace.path);
      if (projectCmd) {
        this.executeCommand(projectCmd, fileName, workspace.path, filePath);
        return;
      }
    }

    if (!langCap) {
      this.showExecutionError({
        type: 'LANGUAGE_NOT_SUPPORTED',
        title: 'Language Not Supported',
        message: 'This file type cannot be executed directly.',
        file: fileName
      });
      return;
    }

    // Check Dependencies
    const depError = await ExecutionResolver.resolveDependencies(workspace.path);
    if (depError) {
      this.showExecutionError(depError);
      return;
    }

    // Check Runtime Requirements
    const reqError = await ExecutionResolver.resolveLanguageRequirements(langCap, workspace.path);
    if (reqError) {
      reqError.file = fileName;
      this.showExecutionError(reqError);
      return;
    }

    // Save before executing
    const absolutePath = `${workspace.path}/${filePath}`;
    await fileService.writeFile(absolutePath, content);

    const baseName = fileName.split('.').slice(0, -1).join('.');
    const command = langCap.runCommandGenerator(fileName, baseName);
    this.executeCommand(command, fileName, workspace.path, filePath);
  }

  private executeCommand(command: string, fileName: string, cwd: string, filePath: string) {
    useUIStore.getState().setBottomPanelVisible(true);
    useUIStore.getState().setActiveBottomPanel('terminal');

    this.updateState(filePath, 'running');
    this.currentSessionId = `exec-${Date.now()}`;

    // Small delay to ensure terminal is rendered
    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ai-web-ide:terminal-run', { detail: { command, fileName, cwd } }));
    }, 150);

    // Simulated process tracking for now. In a full implementation, the terminal backend would send a stop event.
    setTimeout(() => {
       this.updateState(filePath, 'idle');
    }, 4000);
  }

  private showExecutionError(error: any) {
    window.dispatchEvent(new CustomEvent('ai-web-ide:execution-error', { detail: error }));
  }

  stop(filePath: string) {
    this.updateState(filePath, 'idle');
    window.dispatchEvent(new CustomEvent('ai-web-ide:terminal-stop'));
  }
}

export const executionService = new ExecutionManager();
