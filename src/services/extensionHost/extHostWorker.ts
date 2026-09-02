/// <reference lib="webworker" />

const registeredCommands = new Map<string, Function>();

function post(type: string, payload: any = {}) {
  self.postMessage({ type, ...payload });
}

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
        post('vscode.commands.executeCommand', { commandId, args });
      }
    },
    languages: {
      registerCompletionItemProvider: (selector: any, provider: any, ...triggerCharacters: string[]) => {
        post('vscode.languages.registerCompletionItemProvider', { selector, triggerCharacters, extensionId });
        return { dispose: () => {} };
      },
      registerHoverProvider: (selector: any, provider: any) => {
        post('vscode.languages.registerHoverProvider', { selector, extensionId });
        return { dispose: () => {} };
      }
    },
    workspace: {
      fs: {
        readFile: async (uri: any) => {
          return new Uint8Array();
        }
      }
    }
  };
}

const activeExtensions = new Map<string, any>();

self.addEventListener('message', async (e) => {
  const { type, payload } = e.data;

  if (type === 'activateExtension') {
    const { id, code } = payload;
    try {
      const wrappedCode = `
        (function(require, exports, module) {
          ${code}
        })
      `;
      const fn = eval(wrappedCode);
      const module = { exports: {} };
      const customRequire = (moduleName: string) => {
        if (moduleName === 'vscode') {
          return createApi(id);
        }
        throw new Error(`Module not found: ${moduleName}`);
      };
      
      fn(customRequire, module.exports, module);
      
      const exports = module.exports as any;
      if (exports && exports.activate) {
        await exports.activate({
          subscriptions: []
        });
        activeExtensions.set(id, exports);
        post('extensionActivated', { id });
      } else {
        post('extensionError', { id, error: 'Extension does not export an activate function.' });
      }
    } catch (err: any) {
      post('extensionError', { id, error: err.message });
    }
  } 
  else if (type === 'executeCommand') {
    const { commandId, args } = payload;
    const callback = registeredCommands.get(commandId);
    if (callback) {
      try {
        await callback(...(args || []));
      } catch (err: any) {
        post('vscode.window.showErrorMessage', { message: `Command '${commandId}' failed: ${err.message}` });
      }
    }
  }
});
