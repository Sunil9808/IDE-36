import { fileService } from './fileService';

export async function createExtensionProject(basePath: string = '/my-extension') {
  const folders = [
    basePath,
    `${basePath}/src`,
  ];

  for (const folder of folders) {
    try {
      await fileService.createFolder(folder);
    } catch {
      // Ignore if exists
    }
  }

  const manifest = {
    name: "my-extension",
    displayName: "My Extension",
    version: "1.0.0",
    description: "My first AI Web IDE extension",
    activationEvents: ["onLanguage:javascript", "onCommand:myExtension.hello"],
    contributes: {
      commands: [
        {
          command: "myExtension.hello",
          title: "My Extension: Say Hello"
        }
      ]
    },
    permissions: ["workspace", "terminal"]
  };

  const extensionTs = `
import * as ide from 'vscode'; // standard vscode API in ide

export function activate(context: ide.ExtensionContext) {
  console.log('My Extension activated!');

  const cmd = ide.commands.registerCommand('myExtension.hello', () => {
    ide.window.showInformationMessage('Hello from My Extension!');
  });

  context.subscriptions.push(cmd);
}

export function deactivate() {
  console.log('My Extension deactivated.');
}
`.trim();

  const tsconfig = {
    compilerOptions: {
      target: "es2020",
      module: "esnext",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      moduleResolution: "node"
    },
    include: ["src/**/*"]
  };

  const packageJson = {
    name: "my-extension",
    version: "1.0.0",
    scripts: {
      build: "tsc",
      watch: "tsc -w"
    },
    devDependencies: {
      typescript: "^5.0.0"
    }
  };

  try { await fileService.createFile(`${basePath}/manifest.json`, JSON.stringify(manifest, null, 2)); } catch {}
  try { await fileService.createFile(`${basePath}/package.json`, JSON.stringify(packageJson, null, 2)); } catch {}
  try { await fileService.createFile(`${basePath}/tsconfig.json`, JSON.stringify(tsconfig, null, 2)); } catch {}
  try { await fileService.createFile(`${basePath}/src/extension.ts`, extensionTs); } catch {}
}
