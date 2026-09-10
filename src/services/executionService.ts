import { fileService } from './fileService';
import { useUIStore } from '../store/uiStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { runnerRegistry, ExecutionPlan } from './execution/RunnerRegistry';
import { ProjectManager } from './execution/ProjectManager';
import { detectLanguageFromExtension } from './execution/LanguageRegistry';

export type ExecutionState = 'idle' | 'running' | 'completed' | 'error';

class ExecutionManager {
  private currentSessionId: string | null = null;
  private onStateChangeMap: Map<string, (state: ExecutionState) => void> = new Map();
  private states: Map<string, ExecutionState> = new Map();

  constructor() {
    window.addEventListener('ai-web-ide:terminal-completed', ((e: CustomEvent) => {
       // When any terminal completes, we reset the running states
       for (const [filePath, state] of this.states.entries()) {
          if (state === 'running') {
             this.updateState(filePath, e.detail.exitCode === 0 ? 'completed' : 'error');
             // Auto clear completed after 3s
             setTimeout(() => {
                 if (this.getState(filePath) === 'completed' || this.getState(filePath) === 'error') {
                    this.updateState(filePath, 'idle');
                 }
             }, 3000);
          }
       }
    }) as any);
  }

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
    return false; // Deprecated, we now rely on ProjectManager
  }

  async runProject(workspacePath: string, scriptName?: string) {
     const plan = await ProjectManager.getProjectRunPlan(workspacePath, scriptName);
     if (plan) {
        this.executeCommand(plan.command + ' ' + (plan.args || []).join(' '), "Project", plan.cwd, workspacePath);
     } else {
        this.showExecutionError({
            title: 'Run Project Failed',
            message: 'No project configuration found (package.json, pom.xml, etc).',
        });
     }
  }

  async runFile(filePath: string, content: string) {
    if (this.getState(filePath) === 'running') return;

    const fileName = filePath.split('/').pop() || '';
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) return;
    
    // Check if it's a project
    const projectType = await ProjectManager.detectProjectType(workspace.path);
    if (projectType && (fileName === 'package.json' || fileName === 'pom.xml' || fileName === 'build.gradle')) {
        return this.runProject(workspace.path);
    }
    
    // Fallback for HTML preview
    const langCap = detectLanguageFromExtension(fileName);
    if (langCap?.executionMode === 'browser-preview') {
      useUIStore.getState().setBottomPanelVisible(true);
      useUIStore.getState().setActiveBottomPanel('preview');
      window.dispatchEvent(new CustomEvent('ai-web-ide:start-preview'));
      return;
    }

    const language = langCap ? langCap.id : null;
    if (!language) {
      this.showExecutionError({
        title: 'Language Not Supported',
        message: 'This file type cannot be executed directly.',
        file: fileName
      });
      return;
    }

    const context = {
       fileName: filePath,
       language,
       workspaceRoot: workspace.path
    };

    const runner = await runnerRegistry.getRunnerForLanguage(language, context);
    if (!runner) {
      this.showExecutionError({
        title: 'Runner Not Found',
        message: `No registered runner for ${language}.`,
        file: fileName
      });
      return;
    }

    const validation = await runner.validate(context);
    if (!validation.valid) {
      this.showExecutionError({
        title: 'Execution Blocked',
        message: validation.reason || 'Missing required runtime.',
        file: fileName
      });
      return;
    }

    // Save before executing
    const absolutePath = filePath.startsWith(workspace.path) 
      ? filePath 
      : `${workspace.path}/${filePath}`.replace(/\/+/g, '/');
    await fileService.writeFile(absolutePath, content);
    
    try {
      await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content })
      });
    } catch (e) {
      console.warn('Failed to sync file to backend:', e);
    }

    const plan = await runner.run(context);
    const commandStr = `${plan.command} ${plan.args.join(' ')}`;
    
    this.executeCommand(commandStr, fileName, plan.cwd || workspace.path, filePath);
  }

  private executeCommand(command: string, fileName: string, cwd: string, filePath: string) {
    useUIStore.getState().setBottomPanelVisible(true);
    useUIStore.getState().setActiveBottomPanel('terminal');

    this.updateState(filePath, 'running');
    this.currentSessionId = `exec-${Date.now()}`;

    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ai-web-ide:terminal-run', { detail: { command, fileName, cwd } }));
    }, 150);
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
