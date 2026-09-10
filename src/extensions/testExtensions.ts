export const internalTestExtensions = [
  {
    id: 'system.test-formatter',
    displayName: 'Test Formatter',
    description: 'Formats JavaScript code: const x={a:1} -> const x = { a: 1 };',
    version: '1.0.0',
    publisher: 'System',
    categories: ['Formatters'],
    activationEvents: ['onLanguage:javascript', 'onLanguage:typescript'],
    icon: 'https://cdn.jsdelivr.net/gh/PKief/vscode-material-icon-theme@main/icons/prettier.svg',
    code: `
      function activate(context) {
        const vscode = require('vscode');
        console.log('Test Formatter activated');
        const config = vscode.workspace.getConfiguration('editor');
        const tabSize = config.get('tabSize', 2);
        
        const provider = {
          provideDocumentFormattingEdits(document) {
            console.log('Formatting with tabSize: ' + tabSize);
            const text = document.getText();
            const formatted = text.replace(/\\s*=\\s*/g, ' = ').replace(/\\s*:\\s*/g, ': ');
            return [{
              range: { startLineNumber: 1, startColumn: 1, endLineNumber: 9999, endColumn: 9999 },
              text: formatted
            }];
          }
        };
        context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider('*', provider));
      }
      exports.activate = activate;
    `
  },
  {
    id: 'system.test-completion',
    displayName: 'Test Completion',
    description: 'Provides suggestions for test. -> test.success, test.failure',
    version: '1.0.0',
    publisher: 'System',
    categories: ['Programming Languages'],
    activationEvents: ['onLanguage:javascript', 'onLanguage:typescript'],
    icon: 'https://cdn.jsdelivr.net/gh/PKief/vscode-material-icon-theme@main/icons/javascript.svg',
    code: `
      function activate(context) {
        const vscode = require('vscode');
        console.log('Test Completion activating');
        
        const provider = {
          provideCompletionItems(document, position, token, context) {
            const line = document.lineAt(position.line).text;
            const prefix = line.substring(Math.max(0, position.character - 5), position.character);
            
            if (prefix.endsWith('test.')) {
              return [
                {
                  label: 'success',
                  kind: 1, // Method
                  insertText: 'success()',
                  documentation: 'Test successful completion'
                },
                {
                  label: 'failure',
                  kind: 1, // Method
                  insertText: 'failure()',
                  documentation: 'Test failure completion'
                }
              ];
            }
            return [];
          }
        };
        
        context.subscriptions.push(
          vscode.languages.registerCompletionItemProvider('*', provider, '.')
        );
      }
      exports.activate = activate;
    `
  },
  {
    id: 'system.test-command',
    displayName: 'Test Command',
    description: 'Registers command to create a test file in the workspace.',
    version: '1.0.0',
    publisher: 'System',
    categories: ['Other'],
    activationEvents: ['*'],
    icon: 'https://cdn.jsdelivr.net/gh/PKief/vscode-material-icon-theme@main/icons/document.svg',
    code: `
      function activate(context) {
        const vscode = require('vscode');
        console.log('Test Command activating');
        
        context.subscriptions.push(
          vscode.commands.registerCommand('testExtension.createFile', async () => {
            const uri = vscode.Uri.file('test-file.txt');
            const content = new TextEncoder().encode('Hello from Test Extension Command!');
            await vscode.workspace.fs.writeFile(uri, content);
            vscode.window.showInformationMessage('File test-file.txt created successfully!');
          })
        );
      }
      exports.activate = activate;
    `
  },
  {
    id: 'system.test-diagnostics',
    displayName: 'Test Diagnostics',
    description: 'Highlights the word BUG as an error.',
    version: '1.0.0',
    publisher: 'System',
    categories: ['Linters'],
    activationEvents: ['onLanguage:javascript', 'onLanguage:typescript'],
    icon: 'https://cdn.jsdelivr.net/gh/PKief/vscode-material-icon-theme@main/icons/error.svg',
    code: `
      function activate(context) {
        const vscode = require('vscode');
        console.log('Test Diagnostics activating');
        
        const collection = vscode.languages.createDiagnosticCollection('test-linter');
        
        context.subscriptions.push(
          vscode.workspace.onDidChangeTextDocument((e) => {
             const uri = vscode.Uri.file(e.document.fileName);
             const diagnostics = [];
             
             // Look for the word BUG
             const lines = e.document.getText().split('\\n');
             for (let i = 0; i < lines.length; i++) {
               const idx = lines[i].indexOf('BUG');
               if (idx !== -1) {
                 diagnostics.push({
                   severity: vscode.DiagnosticSeverity.Error,
                   message: 'Intentional BUG found by Test Diagnostics',
                   range: {
                     start: { line: i, character: idx },
                     end: { line: i, character: idx + 3 }
                   }
                 });
               }
             }
             
             collection.set(uri, diagnostics);
          })
        );
      }
      exports.activate = activate;
    `
  }
];
