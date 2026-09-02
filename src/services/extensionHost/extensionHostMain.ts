import { registerCommand } from '../extensionRuntime';

export class ExtensionHost {
  private worker: Worker | null = null;
  private activeExtensions = new Set<string>();

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    this.worker = new Worker(new URL('./extHostWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
  }

  private handleWorkerMessage(e: MessageEvent) {
    const { type, ...payload } = e.data;
    
    switch (type) {
      case 'vscode.window.showInformationMessage':
        window.dispatchEvent(new CustomEvent('ai-web-ide:notify', { detail: { type: 'info', message: payload.message } }));
        break;
      case 'vscode.window.showWarningMessage':
        window.dispatchEvent(new CustomEvent('ai-web-ide:notify', { detail: { type: 'warning', message: payload.message } }));
        break;
      case 'vscode.window.showErrorMessage':
        window.dispatchEvent(new CustomEvent('ai-web-ide:notify', { detail: { type: 'error', message: payload.message } }));
        break;
      case 'vscode.commands.registerCommand':
        this.registerMainThreadCommand(payload.commandId, payload.extensionId || 'unknown');
        break;
      case 'extensionActivated':
        console.log(`Extension ${payload.id} activated successfully`);
        break;
      case 'extensionError':
        console.error(`Extension ${payload.id} failed: ${payload.error}`);
        break;
    }
  }

  private registerMainThreadCommand(commandId: string, extensionId: string) {
    registerCommand({
      id: commandId,
      label: commandId, // In a real system, we'd look up the label in package.json
      extensionId: extensionId,
      extensionName: extensionId,
      category: 'Extension',
      action: () => {
        this.executeCommand(commandId);
      }
    });
  }

  public async activateExtension(id: string, code: string) {
    if (this.activeExtensions.has(id)) return;
    
    this.worker?.postMessage({
      type: 'activateExtension',
      payload: { id, code }
    });
    this.activeExtensions.add(id);
  }

  public deactivateExtension(id: string) {
    if (!this.activeExtensions.has(id)) return;
    this.worker?.postMessage({
      type: 'deactivateExtension',
      payload: { id }
    });
    this.activeExtensions.delete(id);
  }

  public executeCommand(commandId: string, ...args: any[]) {
    this.worker?.postMessage({
      type: 'executeCommand',
      payload: { commandId, args }
    });
  }
}

export const extensionHost = new ExtensionHost();
