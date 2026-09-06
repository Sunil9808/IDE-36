/// <reference lib="webworker" />

const registeredCommands = new Map<string, Function>();
const registeredFormatters = new Map<string, any>();
const registeredCompletions = new Map<string, any>();
const diagnosticCollections = new Map<string, any>();

let nextProviderId = 1;
let nextReqId = 1;

// RPC promises waiting for main thread response
const pendingMainThreadRequests = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();

function post(type: string, payload: any = {}) {
  self.postMessage({ type, ...payload });
}

function sendRpc(type: string, payload: any = {}): Promise<any> {
  const reqId = nextReqId++;
  return new Promise((resolve, reject) => {
    pendingMainThreadRequests.set(reqId, { resolve, reject });
    self.postMessage({ type, reqId, ...payload });
  });
}

const registeredRunners = new Map<string, any>();
function createApi(extensionId: string) {
  return {
    window: {
      showInformationMessage: (message: string) => {
        post('vscode.window.showInformationMessage', { message });
      },
      showWarningMessage: (message: string) => {
        post('vscode.window.showWarningMessage', { message });
      },
      showErrorMessage: (message: string) => {
        post('vscode.window.showErrorMessage', { message });
      }
    },
    commands: {
      registerCommand: (commandId: string, callback: (...args: any[]) => any) => {
        registeredCommands.set(commandId, callback);
        post('vscode.commands.registerCommand', { commandId, extensionId });
        return { dispose: () => registeredCommands.delete(commandId) };
      },
      executeCommand: (commandId: string, ...args: any[]) => {
        return sendRpc('vscode.commands.executeCommand', { commandId, args });
      }
    },
    languages: {
      registerDocumentFormattingEditProvider: (selector: any, provider: any) => {
        const id = `formatter-${nextProviderId++}`;
        registeredFormatters.set(id, provider);
        post('vscode.languages.registerDocumentFormattingEditProvider', { id, selector, extensionId });
        return { dispose: () => registeredFormatters.delete(id) };
      },
      registerCompletionItemProvider: (selector: any, provider: any, ...triggerCharacters: string[]) => {
        const id = `completion-${nextProviderId++}`;
        registeredCompletions.set(id, provider);
        post('vscode.languages.registerCompletionItemProvider', { id, selector, triggerCharacters, extensionId });
        return { dispose: () => registeredCompletions.delete(id) };
      },
      
      registerHoverProvider: (selector: any, provider: any) => {
        const id = `hover-${nextProviderId++}`;
        registeredCompletions.set(id, provider); // reusing map for simplicity
        post('vscode.languages.registerHoverProvider', { id, selector, extensionId });
        return { dispose: () => registeredCompletions.delete(id) };
      },
      registerDefinitionProvider: (selector: any, provider: any) => {
        const id = `def-${nextProviderId++}`;
        registeredCompletions.set(id, provider);
        post('vscode.languages.registerDefinitionProvider', { id, selector, extensionId });
        return { dispose: () => registeredCompletions.delete(id) };
      },
      registerReferenceProvider: (selector: any, provider: any) => {
        const id = `ref-${nextProviderId++}`;
        registeredCompletions.set(id, provider);
        post('vscode.languages.registerReferenceProvider', { id, selector, extensionId });
        return { dispose: () => registeredCompletions.delete(id) };
      },
      registerRenameProvider: (selector: any, provider: any) => {
        const id = `rename-${nextProviderId++}`;
        registeredCompletions.set(id, provider);
        post('vscode.languages.registerRenameProvider', { id, selector, extensionId });
        return { dispose: () => registeredCompletions.delete(id) };
      },
      registerCodeActionsProvider: (selector: any, provider: any) => {
        const id = `action-${nextProviderId++}`;
        registeredCompletions.set(id, provider);
        post('vscode.languages.registerCodeActionsProvider', { id, selector, extensionId });
        return { dispose: () => registeredCompletions.delete(id) };
      },

      createDiagnosticCollection: (name: string) => {
        const collection = {
          name,
          set: (uri: any, diagnostics: any[]) => {
            post('vscode.languages.setDiagnostics', { uri: uri.toString(), diagnostics, collectionName: name });
          },
          clear: () => {
            post('vscode.languages.clearDiagnostics', { collectionName: name });
          },
          dispose: () => {
            post('vscode.languages.clearDiagnostics', { collectionName: name });
          }
        };
        diagnosticCollections.set(name, collection);
        return collection;
      }
    },
    workspace: {
      getConfiguration: (section?: string) => {
        // Synchronous config fetch by sending a fast IPC to a cached dict, 
        // or we just return a Proxy that sends an RPC. Let's return a simple mock for now
        // since true sync IPC isn't possible in Web Workers without SharedArrayBuffer.
        // We will just return a mock object that extensions can call .get() on.
        return {
          get: (key: string, defaultValue?: any) => {
             // In a real implementation this would read from a synced cache sent from main thread.
             return defaultValue;
          },
          update: async (key: string, value: any) => {
             await sendRpc('vscode.workspace.updateConfiguration', { section, key, value });
          }
        };
      },
      onDidChangeConfiguration: (callback: (e: any) => void) => {
        registeredCommands.set(`$onDidChangeConfiguration_${extensionId}`, callback);
        return { dispose: () => {} };
      },
      onDidChangeTextDocument: (callback: (e: any) => void) => {
        post('vscode.workspace.registerTextDocumentChange', { extensionId });
        registeredCommands.set(`$onDidSave_${extensionId}`, callback);
        return { dispose: () => {} };
      },
      fs: {
        writeFile: async (uri: any, content: Uint8Array) => {
          // Convert Uint8Array to string for simple JSON transmission
          const text = new TextDecoder().decode(content);
          return sendRpc('vscode.workspace.fs.writeFile', { uri: uri.toString(), content: text });
        },
        readFile: async (uri: any) => {
          const text = await sendRpc('vscode.workspace.fs.readFile', { uri: uri.toString() });
          return new TextEncoder().encode(text);
        }
      }
    },
    
    process: {
      execute: async (options: any) => {
        return sendRpc('vscode.process.execute', { options, extensionId });
      }
    },
    runners: {
      registerRunner: (runner: any) => {
        const id = `runner-${nextProviderId++}`;
        registeredRunners.set(id, runner);
        post('vscode.runners.registerRunner', { 
          id, 
          runnerId: runner.id, 
          languages: runner.languages, 
          extensionId 
        });
        return { dispose: () => registeredRunners.delete(id) };
      }
    },

    Uri: {
      file: (path: string) => ({ toString: () => `file://${path}`, path })
    },
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3
    }
  };
}

const activeExtensions = new Map<string, any>();

self.addEventListener('message', async (e) => {
  const { type, payload, reqId } = e.data;

  // Handle RPC responses from main thread
  if (type === 'rpcResponse' && reqId) {
    const pending = pendingMainThreadRequests.get(reqId);
    if (pending) {
      if (payload.error) {
        pending.reject(new Error(payload.error));
      } else {
        pending.resolve(payload.result);
      }
      pendingMainThreadRequests.delete(reqId);
    }
    return;
  }

  try {
    if (type === 'activateExtension') {
      const { id, code } = payload;
      const wrappedCode = `
        (function(require, exports, module) {
          ${code}
        })
      `;
      const fn = eval(wrappedCode);
      const module = { exports: {} };
      const customRequire = (moduleName: string) => {
        if (moduleName === 'vscode') return createApi(id);
        throw new Error(`Module not found: ${moduleName}`);
      };
      
      fn(customRequire, module.exports, module);
      
      const exports = module.exports as any;
      if (exports && exports.activate) {
        await exports.activate({ subscriptions: [] });
        activeExtensions.set(id, exports);
        post('extensionActivated', { id });
      } else {
        post('extensionError', { id, error: 'Extension does not export an activate function.' });
      }
    } 
    else if (type === 'executeCommand') {
      const { commandId, args } = payload;
      const callback = registeredCommands.get(commandId);
      if (callback) {
        const result = await callback(...(args || []));
        if (reqId) post('rpcResponse', { reqId, payload: { result } });
      } else if (reqId) {
        post('rpcResponse', { reqId, payload: { error: `Command not found: ${commandId}` } });
      }
    }
    else if (type === 'invokeFormatter') {
      const { providerId, text, options } = payload;
      const provider = registeredFormatters.get(providerId);
      if (provider && provider.provideDocumentFormattingEdits) {
        const fakeDocument = {
          getText: () => text,
          languageId: options.languageId,
        };
        const edits = await provider.provideDocumentFormattingEdits(fakeDocument, options, null);
        post('rpcResponse', { reqId, payload: { result: edits } });
      } else {
        post('rpcResponse', { reqId, payload: { result: null } });
      }
    }
    else if (type === 'invokeCompletion') {
      const { providerId, text, position } = payload;
      const provider = registeredCompletions.get(providerId);
      if (provider && provider.provideCompletionItems) {
        const fakeDocument = {
          getText: () => text,
          lineAt: (lineNum: number) => ({ text: text.split('\n')[lineNum] })
        };
        const items = await provider.provideCompletionItems(fakeDocument, position, null, null);
        post('rpcResponse', { reqId, payload: { result: items } });
      } else {
        post('rpcResponse', { reqId, payload: { result: null } });
      }
    }
    
    else if (type === 'invokeRunner') {
      const { providerId, context, methodName } = payload;
      const runner = registeredRunners.get(providerId);
      if (runner && typeof runner[methodName] === 'function') {
        try {
          const result = await runner[methodName](context);
          post('rpcResponse', { reqId, payload: { result } });
        } catch (e: any) {
          post('rpcResponse', { reqId, payload: { error: e.message } });
        }
      } else {
        post('rpcResponse', { reqId, payload: { error: 'Runner or method not found' } });
      }
    }

    
    else if (type === 'invokeHover') {
      const { providerId, text, position } = payload;
      const provider = registeredCompletions.get(providerId);
      if (provider && provider.provideHover) {
        const fakeDocument = { getText: () => text, lineAt: (lineNum: number) => ({ text: text.split('\n')[lineNum] }) };
        const result = await provider.provideHover(fakeDocument, position, null);
        post('rpcResponse', { reqId, payload: { result } });
      } else post('rpcResponse', { reqId, payload: { result: null } });
    }
    else if (type === 'invokeDefinition') {
      const { providerId, text, position } = payload;
      const provider = registeredCompletions.get(providerId);
      if (provider && provider.provideDefinition) {
        const fakeDocument = { getText: () => text, lineAt: (lineNum: number) => ({ text: text.split('\n')[lineNum] }) };
        const result = await provider.provideDefinition(fakeDocument, position, null);
        post('rpcResponse', { reqId, payload: { result } });
      } else post('rpcResponse', { reqId, payload: { result: null } });
    }
    else if (type === 'invokeReferences') {
      const { providerId, text, position, context } = payload;
      const provider = registeredCompletions.get(providerId);
      if (provider && provider.provideReferences) {
        const fakeDocument = { getText: () => text, lineAt: (lineNum: number) => ({ text: text.split('\n')[lineNum] }) };
        const result = await provider.provideReferences(fakeDocument, position, context, null);
        post('rpcResponse', { reqId, payload: { result } });
      } else post('rpcResponse', { reqId, payload: { result: null } });
    }
    else if (type === 'invokeRename') {
      const { providerId, text, position, newName } = payload;
      const provider = registeredCompletions.get(providerId);
      if (provider && provider.provideRenameEdits) {
        const fakeDocument = { getText: () => text, lineAt: (lineNum: number) => ({ text: text.split('\n')[lineNum] }) };
        const result = await provider.provideRenameEdits(fakeDocument, position, newName, null);
        post('rpcResponse', { reqId, payload: { result } });
      } else post('rpcResponse', { reqId, payload: { result: null } });
    }
    else if (type === 'invokeCodeActions') {
      const { providerId, text, range, context } = payload;
      const provider = registeredCompletions.get(providerId);
      if (provider && provider.provideCodeActions) {
        const fakeDocument = { getText: () => text, lineAt: (lineNum: number) => ({ text: text.split('\n')[lineNum] }) };
        const result = await provider.provideCodeActions(fakeDocument, range, context, null);
        post('rpcResponse', { reqId, payload: { result } });
      } else post('rpcResponse', { reqId, payload: { result: null } });
    }

    else if (type === 'getRegisteredCapabilities') {
       // Return a summary of what's registered
       const formatters = Array.from(registeredFormatters.keys());
       const completions = Array.from(registeredCompletions.keys());
       const commands = Array.from(registeredCommands.keys());
       const diagnostics = Array.from(diagnosticCollections.keys());
       const runners = Array.from(registeredRunners.keys());
       post('rpcResponse', { reqId, payload: { result: { formatters, completions, commands, diagnostics, runners } } });
    }
    else if (type === 'deactivateExtension') {
      const { id } = payload;
      // In a full implementation, we would call the extension's exported deactivate() function
      // and dispose all disposables in context.subscriptions.
      // For now, we manually prune the registries for this extension ID.
      
      for (const [key, provider] of registeredFormatters.entries()) {
         if (key.includes(id)) registeredFormatters.delete(key);
      }
      for (const [key, provider] of registeredCompletions.entries()) {
         if (key.includes(id)) registeredCompletions.delete(key);
      }
      for (const [key, cmd] of registeredCommands.entries()) {
         if (key.includes(id)) registeredCommands.delete(key);
      }
      for (const [key, col] of diagnosticCollections.entries()) {
         if (key.includes(id)) diagnosticCollections.delete(key);
      }
      for (const [key, provider] of registeredRunners.entries()) {
         if (key.includes(id)) registeredRunners.delete(key);
      }
    }
  } catch (err: any) {
    if (reqId) {
      post('rpcResponse', { reqId, payload: { error: err.message } });
    } else {
      post('extensionError', { id: payload?.id || 'unknown', error: err.message });
    }
  }
});
