import { registerCommand } from '../extensionRuntime';
import { fileService } from '../fileService';
import { useWorkspaceStore } from '../../store/workspaceStore';

export class ExtensionHost {
  private worker: Worker | null = null;
  private activeExtensions = new Set<string>();
  
  // RPC promises waiting for worker response
  private pendingWorkerRequests = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();
  private nextReqId = 1;
  
  // Monaco reference
  private monaco: typeof import('monaco-editor') | null = null;

  constructor() {
    this.initWorker();
  }
  
  public setMonacoInstance(monaco: typeof import('monaco-editor')) {
    this.monaco = monaco;
  }

  private initWorker() {
    this.worker = new Worker(new URL('./extHostWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
  }
  
  private sendRpc(type: string, payload: any = {}): Promise<any> {
    const reqId = this.nextReqId++;
    return new Promise((resolve, reject) => {
      this.pendingWorkerRequests.set(reqId, { resolve, reject });
      this.worker?.postMessage({ type, reqId, payload });
    });
  }

  private async handleWorkerMessage(e: MessageEvent) {
    const { type, reqId, ...payload } = e.data;
    
    // Handle RPC responses from worker
    if (type === 'rpcResponse' && reqId) {
      const pending = this.pendingWorkerRequests.get(reqId);
      if (pending) {
        if (payload.payload?.error) {
          pending.reject(new Error(payload.payload.error));
        } else {
          pending.resolve(payload.payload?.result);
        }
        this.pendingWorkerRequests.delete(reqId);
      }
      return;
    }
    
    try {
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
        
        case 'vscode.process.execute':
          if (reqId) {
            import('../terminalService').then(({ terminalService }) => {
              const execSessionId = `ext-exec-${Date.now()}`;
              let stdout = '';
              let stderr = '';
              
              const { command, args, cwd } = payload.options;
              const fullCommand = `${command} ${(args || []).join(' ')}`;
              
              terminalService.createSession(execSessionId, 'bash', cwd || '/');
              
              const onData = (data: any) => {
                if (data.sessionId === execSessionId) {
                  stdout += data.data;
                }
              };
              
              terminalService.onData(onData);
              terminalService.sendData(execSessionId, fullCommand + '\n');
              
              // Simplistic wait for completion or prompt (not perfect, but works for POC)
              setTimeout(() => {
                terminalService.sendData(execSessionId, 'exit\n');
              }, 1000);
              
              setTimeout(() => {
                terminalService.destroySession(execSessionId);
                this.worker?.postMessage({ type: 'rpcResponse', reqId, payload: { result: { exitCode: 0, stdout, stderr } } });
              }, 1500);
            });
          }
          break;
          
        case 'vscode.runners.registerRunner':
          import('../extensionRuntime').then(({ registerRunner }) => {
             registerRunner({
               id: payload.runnerId,
               languages: payload.languages,
               extensionId: payload.extensionId,
               createExecution: async (context) => {
                 return this.sendRpc('invokeRunner', { providerId: payload.id, context, methodName: 'createExecution' });
               },
               canRun: async (context) => {
                 return this.sendRpc('invokeRunner', { providerId: payload.id, context, methodName: 'canRun' });
               },
               validate: async (context) => {
                 return this.sendRpc('invokeRunner', { providerId: payload.id, context, methodName: 'validate' });
               }
             });
          });
          break;
          
        case 'vscode.window.createTerminal':
          import('../../store/uiStore').then(({ useUIStore }) => {
            useUIStore.getState().setBottomPanelVisible(true);
            useUIStore.getState().setActiveBottomPanel('terminal');
            window.dispatchEvent(new CustomEvent('ai-web-ide:terminal-command', { detail: { action: 'new', name: payload.name } }));
          });
          break;

        case 'vscode.commands.registerCommand':
          this.registerMainThreadCommand(payload.commandId, payload.extensionId || 'unknown');
          break;
        case 'vscode.languages.registerDocumentFormattingEditProvider':
          this.registerMainThreadFormatter(payload.id, payload.selector, payload.extensionId);
          break;
        
        case 'vscode.languages.registerHoverProvider':
          this.registerMainThreadHover(payload.id, payload.selector, payload.extensionId);
          break;
        case 'vscode.languages.registerDefinitionProvider':
          this.registerMainThreadDefinition(payload.id, payload.selector, payload.extensionId);
          break;
        case 'vscode.languages.registerReferenceProvider':
          this.registerMainThreadReference(payload.id, payload.selector, payload.extensionId);
          break;
        case 'vscode.languages.registerRenameProvider':
          this.registerMainThreadRename(payload.id, payload.selector, payload.extensionId);
          break;
        case 'vscode.languages.registerCodeActionsProvider':
          this.registerMainThreadCodeActions(payload.id, payload.selector, payload.extensionId);
          break;

        case 'vscode.languages.registerCompletionItemProvider':
          this.registerMainThreadCompletion(payload.id, payload.selector, payload.triggerCharacters, payload.extensionId);
          break;
        case 'vscode.languages.setDiagnostics':
          this.setMainThreadDiagnostics(payload.uri, payload.diagnostics, payload.collectionName);
          break;
        case 'vscode.languages.clearDiagnostics':
          this.clearMainThreadDiagnostics(payload.collectionName);
          break;
        case 'vscode.workspace.registerTextDocumentChange':
          this.registerMainThreadTextDocumentChange(payload.extensionId);
          break;
        case 'vscode.workspace.fs.readFile':
          if (reqId) {
            const text = await this.handleFsRead(payload.uri);
            this.worker?.postMessage({ type: 'rpcResponse', reqId, payload: { result: text } });
          }
          break;
        case 'vscode.workspace.fs.writeFile':
          if (reqId) {
            await this.handleFsWrite(payload.uri, payload.content);
            this.worker?.postMessage({ type: 'rpcResponse', reqId, payload: { result: true } });
          }
          break;
        case 'vscode.workspace.updateConfiguration':
          if (reqId) {
            // For now, just a dummy implementation that succeeds
            console.log(`Setting config ${payload.section}.${payload.key} =`, payload.value);
            this.worker?.postMessage({ type: 'rpcResponse', reqId, payload: { result: true } });
          }
          break;
        case 'extensionActivated':
          console.log(`Extension ${payload.id} activated successfully`);
          break;
        case 'extensionError':
          console.error(`Extension ${payload.id} failed: ${payload.error}`);
          break;
      }
    } catch (err: any) {
      if (reqId) {
        this.worker?.postMessage({ type: 'rpcResponse', reqId, payload: { error: err.message } });
      } else {
        console.error('Error handling worker message:', err);
      }
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
  
  private registerMainThreadFormatter(id: string, selector: any, extensionId: string) {
    if (!this.monaco) return;
    
    // We register for all languages if selector is missing/generic, otherwise just the selector
    // Monaco doesn't have a generic "*" register, so we assume javascript if not provided for now,
    // or register for common languages.
    const langs = ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'python', 'html', 'css', 'json'];
    
    for (const lang of langs) {
      this.monaco.languages.registerDocumentFormattingEditProvider(lang, {
        provideDocumentFormattingEdits: async (model, options) => {
          const text = model.getValue();
          try {
            const edits = await this.sendRpc('invokeFormatter', { 
              providerId: id, 
              text, 
              options: { languageId: lang, ...options } 
            });
            if (edits && edits.length > 0) {
              return edits.map((e: any) => ({
                range: model.getFullModelRange(), // Fallback if extension doesn't specify exact range
                text: e.newText || e.text,
                ...(e.range ? {
                  range: new this.monaco!.Range(
                    e.range.startLineNumber, e.range.startColumn,
                    e.range.endLineNumber, e.range.endColumn
                  )
                } : {})
              }));
            }
          } catch (e) {
            console.error('Formatter error:', e);
          }
          return [];
        }
      });
    }
  }
  
  private registerMainThreadCompletion(id: string, selector: any, triggerCharacters: string[], extensionId: string) {
    if (!this.monaco) return;
    
    const langs = ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'python', 'html', 'css', 'json'];
    
    for (const lang of langs) {
      this.monaco.languages.registerCompletionItemProvider(lang, {
        triggerCharacters,
        provideCompletionItems: async (model, position) => {
          const text = model.getValue();
          try {
            const items = await this.sendRpc('invokeCompletion', { 
              providerId: id, 
              text, 
              position: { line: position.lineNumber - 1, character: position.column - 1 } 
            });
            
            if (items && Array.isArray(items)) {
              return {
                suggestions: items.map((i: any) => ({
                  label: i.label,
                  kind: i.kind || this.monaco!.languages.CompletionItemKind.Text,
                  insertText: i.insertText || i.label,
                  insertTextRules: i.insertTextRules,
                  documentation: i.documentation,
                  detail: i.detail,
                  range: undefined as any // Monaco will compute the default range
                }))
              };
            }
          } catch (e) {
            console.error('Completion error:', e);
          }
          return { suggestions: [] };
        }
      });
    }
  }
  
  
  private registerMainThreadHover(id: string, selector: any, extensionId: string) {
    if (!this.monaco) return;
    const langs = typeof selector === 'string' ? [selector] : ['javascript', 'typescript', 'python', 'java', 'cpp', 'html', 'css', 'json', 'rust', 'go', 'php'];
    for (const lang of langs) {
      this.monaco.languages.registerHoverProvider(lang, {
        provideHover: async (model, position) => {
          const text = model.getValue();
          try {
            const res = await this.sendRpc('invokeHover', { providerId: id, text, position: { line: position.lineNumber - 1, character: position.column - 1 } });
            return res;
          } catch (e) { return null; }
        }
      });
    }
  }

  private registerMainThreadDefinition(id: string, selector: any, extensionId: string) {
    if (!this.monaco) return;
    const langs = typeof selector === 'string' ? [selector] : ['javascript', 'typescript', 'python', 'java', 'cpp', 'html', 'css', 'json', 'rust', 'go', 'php'];
    for (const lang of langs) {
      this.monaco.languages.registerDefinitionProvider(lang, {
        provideDefinition: async (model, position) => {
          const text = model.getValue();
          try {
            const res = await this.sendRpc('invokeDefinition', { providerId: id, text, position: { line: position.lineNumber - 1, character: position.column - 1 } });
            // Map VS Code Location to Monaco Location
            if (res && res.uri) {
               return {
                 uri: this.monaco!.Uri.parse(res.uri.path || res.uri),
                 range: res.range
               };
            }
            if (Array.isArray(res)) {
               return res.map((r: any) => ({
                 uri: this.monaco!.Uri.parse(r.uri.path || r.uri),
                 range: r.range
               }));
            }
            return null;
          } catch (e) { return null; }
        }
      });
    }
  }

  private registerMainThreadReference(id: string, selector: any, extensionId: string) {
    if (!this.monaco) return;
    const langs = typeof selector === 'string' ? [selector] : ['javascript', 'typescript', 'python', 'java', 'cpp', 'html', 'css', 'json', 'rust', 'go', 'php'];
    for (const lang of langs) {
      this.monaco.languages.registerReferenceProvider(lang, {
        provideReferences: async (model, position, context) => {
          const text = model.getValue();
          try {
            const res = await this.sendRpc('invokeReferences', { providerId: id, text, position: { line: position.lineNumber - 1, character: position.column - 1 }, context });
            if (Array.isArray(res)) {
               return res.map((r: any) => ({
                 uri: this.monaco!.Uri.parse(r.uri.path || r.uri),
                 range: r.range
               }));
            }
            return null;
          } catch (e) { return null; }
        }
      });
    }
  }

  private registerMainThreadRename(id: string, selector: any, extensionId: string) {
    if (!this.monaco) return;
    const langs = typeof selector === 'string' ? [selector] : ['javascript', 'typescript', 'python', 'java', 'cpp', 'html', 'css', 'json', 'rust', 'go', 'php'];
    for (const lang of langs) {
      this.monaco.languages.registerRenameProvider(lang, {
        provideRenameEdits: async (model, position, newName) => {
          const text = model.getValue();
          try {
            const res = await this.sendRpc('invokeRename', { providerId: id, text, position: { line: position.lineNumber - 1, character: position.column - 1 }, newName });
            if (res && res.changes) {
               const edits: any[] = [];
               for (const uri of Object.keys(res.changes)) {
                  for (const change of res.changes[uri]) {
                     edits.push({
                        resource: this.monaco!.Uri.parse(uri),
                        textEdit: { range: change.range, text: change.newText }
                     });
                  }
               }
               return { edits };
            }
            return res;
          } catch (e) { return null; }
        },
        resolveRenameLocation: async (model, position) => {
           // Basic word resolver
           const word = model.getWordAtPosition(position);
           if (word) {
              return {
                 range: new this.monaco!.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
                 text: word.word
              };
           }
           return null;
        }
      });
    }
  }

  private registerMainThreadCodeActions(id: string, selector: any, extensionId: string) {
    if (!this.monaco) return;
    const langs = typeof selector === 'string' ? [selector] : ['javascript', 'typescript', 'python', 'java', 'cpp', 'html', 'css', 'json', 'rust', 'go', 'php'];
    for (const lang of langs) {
      this.monaco.languages.registerCodeActionProvider(lang, {
        provideCodeActions: async (model, range, context) => {
          const text = model.getValue();
          try {
            const res = await this.sendRpc('invokeCodeActions', { providerId: id, text, range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.endColumn }, context });
            if (res && Array.isArray(res)) {
               return {
                 actions: res.map((a: any) => ({
                   title: a.title,
                   kind: a.kind,
                   edit: a.edit ? {
                     edits: Object.keys(a.edit.changes || {}).flatMap(uri => 
                        a.edit.changes[uri].map((change: any) => ({
                           resource: this.monaco!.Uri.parse(uri),
                           textEdit: { range: change.range, text: change.newText }
                        }))
                     )
                   } : undefined,
                   command: a.command ? {
                      id: a.command.command,
                      title: a.command.title,
                      arguments: a.command.arguments
                   } : undefined
                 })),
                 dispose: () => {}
               };
            }
            return { actions: [], dispose: () => {} };
          } catch (e) { return { actions: [], dispose: () => {} }; }
        }
      });
    }
  }

  private setMainThreadDiagnostics(uri: string, diagnostics: any[], collectionName: string) {
    if (!this.monaco) return;
    
    // uri is usually file://something
    const path = uri.replace('file://', '');
    const monacoUri = this.monaco.Uri.file(path);
    const model = this.monaco.editor.getModel(monacoUri);
    
    if (model) {
      const markers = diagnostics.map(d => ({
        severity: d.severity === 0 ? this.monaco!.MarkerSeverity.Error :
                  d.severity === 1 ? this.monaco!.MarkerSeverity.Warning :
                  d.severity === 2 ? this.monaco!.MarkerSeverity.Info :
                  this.monaco!.MarkerSeverity.Hint,
        message: d.message,
        startLineNumber: d.range.start.line + 1,
        startColumn: d.range.start.character + 1,
        endLineNumber: d.range.end.line + 1,
        endColumn: d.range.end.character + 1,
        source: collectionName
      }));
      
      this.monaco.editor.setModelMarkers(model, collectionName, markers);
    }
  }
  
  private clearMainThreadDiagnostics(collectionName: string) {
    if (!this.monaco) return;
    
    const models = this.monaco.editor.getModels();
    for (const model of models) {
      this.monaco.editor.setModelMarkers(model, collectionName, []);
    }
  }
  
  private registerMainThreadTextDocumentChange(extensionId: string) {
    if (!this.monaco) return;
    
    // Listen to all model changes in Monaco and forward to worker
    this.monaco.editor.onDidCreateModel(model => {
      model.onDidChangeContent(() => {
        const text = model.getValue();
        const uri = model.uri.toString();
        const fileName = uri.replace('file://', '');
        
        this.worker?.postMessage({
          type: 'executeCommand',
          payload: {
            commandId: `$onDidSave_${extensionId}`,
            args: [{ document: { fileName, getText: () => text } }]
          }
        });
      });
      
      // Also fire once immediately for the new model
      const text = model.getValue();
      const uri = model.uri.toString();
      const fileName = uri.replace('file://', '');
      this.worker?.postMessage({
        type: 'executeCommand',
        payload: {
          commandId: `$onDidSave_${extensionId}`,
          args: [{ document: { fileName, getText: () => text } }]
        }
      });
    });
    
    // Also attach to existing models
    for (const model of this.monaco.editor.getModels()) {
      model.onDidChangeContent(() => {
        const text = model.getValue();
        const uri = model.uri.toString();
        const fileName = uri.replace('file://', '');
        
        this.worker?.postMessage({
          type: 'executeCommand',
          payload: {
            commandId: `$onDidSave_${extensionId}`,
            args: [{ document: { fileName, getText: () => text } }]
          }
        });
      });
      
      // Fire once for existing model
      const text = model.getValue();
      const uri = model.uri.toString();
      const fileName = uri.replace('file://', '');
      this.worker?.postMessage({
        type: 'executeCommand',
        payload: {
          commandId: `$onDidSave_${extensionId}`,
          args: [{ document: { fileName, getText: () => text } }]
        }
      });
    }
  }
  
  private async handleFsWrite(uri: string, content: string) {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) throw new Error('No workspace open');
    
    let path = uri.replace('file://', '');
    if (path.startsWith(workspace.path)) {
      // It's already absolute (using the workspace prefix)
    } else {
      path = `${workspace.path}/${path}`;
    }
    
    await fileService.writeFile(path, content);
    // Refresh workspace to show new file
    window.dispatchEvent(new CustomEvent('ai-web-ide:refresh-workspace'));
  }
  
  private async handleFsRead(uri: string) {
    const workspace = useWorkspaceStore.getState().workspace;
    if (!workspace) throw new Error('No workspace open');
    
    let path = uri.replace('file://', '');
    if (path.startsWith(workspace.path)) {
      // It's already absolute (using the workspace prefix)
    } else {
      path = `${workspace.path}/${path}`;
    }
    
    const content = await fileService.readFile(path);
    return content;
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

  public async getRegisteredCapabilities() {
    return this.sendRpc('getRegisteredCapabilities', {});
  }
}

export const extensionHost = new ExtensionHost();
