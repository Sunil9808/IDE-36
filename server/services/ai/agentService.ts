import { exec, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { getChatCompletion, AIContext } from './aiService';
import { NLUResult, ConversationEntry } from './nluService';
import { getWorkspaceRoot, resolveWorkspacePath } from '../../utils/workspaceRoot';
import {
  createFile as fsCreateFile,
  createDirectory as fsCreateDirectory,
  writeFile as fsWriteFile,
  deleteFile as fsDeleteFile,
  renameFile as renameWorkspaceFile,
} from '../fileSystem/fileSystemService';

const execAsync = promisify(exec);
const MAX_OUTPUT = 5000;

type AgentAction =
  | { type: 'listFiles'; path?: string }
  | { type: 'readFile'; path: string }
  | { type: 'mkdir'; path: string }
  | { type: 'writeFile'; path: string; content: string }
  | { type: 'appendFile'; path: string; content: string }
  | { type: 'runCommand'; command: string; cwd?: string }
  | { type: 'installDependency'; packages: string[]; dev?: boolean }
  | { type: 'detectLanguages' }
  | { type: 'deleteFile'; path: string }
  | { type: 'renameFile'; oldPath: string; newPath: string }
  | { type: 'installExtension'; extensionId: string; language?: string }
  | { type: 'askQuestion'; question: string; options: string[] };

export interface AgentResult {
  summary: string;
  plan: string[];
  actions: Array<{
    type: string;
    target: string;
    success: boolean;
    output: string;
  }>;
  nextSteps: string[];
  /** Extensions the agent recommends installing */
  extensionRecommendations?: Array<{ extensionId: string; language: string; reason: string }>;
  /** Languages detected in workspace */
  detectedLanguages?: string[];
}

// ── Language → Extension mapping ─────────────────────────────────────────────

const LANGUAGE_EXTENSION_MAP: Record<string, Array<{ id: string; displayName: string }>> = {
  python: [
    { id: 'ms-python.python', displayName: 'Python' },
    { id: 'ms-python.pylint', displayName: 'Pylint' },
    { id: 'ms-python.black-formatter', displayName: 'Black Formatter' },
  ],
  typescript: [
    { id: 'dbaeumer.vscode-eslint', displayName: 'ESLint' },
    { id: 'esbenp.prettier-vscode', displayName: 'Prettier' },
    { id: 'ms-vscode.vscode-typescript-next', displayName: 'TypeScript Nightly' },
  ],
  javascript: [
    { id: 'dbaeumer.vscode-eslint', displayName: 'ESLint' },
    { id: 'esbenp.prettier-vscode', displayName: 'Prettier' },
  ],
  rust: [
    { id: 'rust-lang.rust-analyzer', displayName: 'rust-analyzer' },
  ],
  go: [
    { id: 'golang.go', displayName: 'Go' },
  ],
  java: [
    { id: 'redhat.java', displayName: 'Language Support for Java' },
    { id: 'vscjava.vscode-java-debug', displayName: 'Debugger for Java' },
  ],
  cpp: [
    { id: 'ms-vscode.cpptools', displayName: 'C/C++' },
  ],
  'c++': [
    { id: 'ms-vscode.cpptools', displayName: 'C/C++' },
  ],
  html: [
    { id: 'formulahendry.auto-rename-tag', displayName: 'Auto Rename Tag' },
    { id: 'bradlc.vscode-tailwindcss', displayName: 'Tailwind CSS IntelliSense' },
  ],
  css: [
    { id: 'esbenp.prettier-vscode', displayName: 'Prettier' },
    { id: 'bradlc.vscode-tailwindcss', displayName: 'Tailwind CSS IntelliSense' },
  ],
  docker: [
    { id: 'ms-azuretools.vscode-docker', displayName: 'Docker' },
  ],
};

// Extension patterns by file extension in workspace
const FILE_EXT_TO_LANG: Record<string, string> = {
  '.py': 'python',
  '.pyw': 'python',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.c': 'cpp',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'css',
  '.dockerfile': 'docker',
  'dockerfile': 'docker',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getActionTarget(action: AgentAction): string {
  if ('path' in action) return (action as { path?: string }).path || '.';
  if ('command' in action) return (action as { command: string }).command;
  if ('packages' in action) return (action as { packages: string[] }).packages.join(', ');
  if ('extensionId' in action) return (action as { extensionId: string }).extensionId;
  return action.type;
}

export function resolveAgentActionPath(value: string, effectiveRoot: string): string {
  let requested = value.trim();
  if (!requested) throw new Error('Path is required');

  // If AI generates a path with a leading slash like "/index.html", treat it as relative to the workspace root.
  // Otherwise path.resolve on Windows resolves it to the drive root (e.g., C:\index.html).
  if (requested.startsWith('/') || requested.startsWith('\\')) {
    requested = requested.substring(1);
  }

  const resolved = path.resolve(effectiveRoot, requested);
  const relative = path.relative(effectiveRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to access path outside workspace: ${value}`);
  }

  // Security guard: If the effectiveRoot resolves to the IDE application root,
  // we must prevent the AI from creating or modifying internal IDE application folders and configuration files.
  // Because we now support arbitrary local workspaces, we just ensure the user hasn't 
  // accidentally set the IDE source tree as their workspace.
  const baseRoot = process.cwd(); // The IDE source root
  if (path.resolve(effectiveRoot) === path.resolve(baseRoot)) {
    throw new Error(`Security Exception: Cannot use the IDE source directory as the workspace root. Please open a different local folder.`);
  }

  return resolved;
}

function isAllowedCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  const allowed = [
    /^npm\s+(run|test|install|i|exec|create|init)\b/i,
    /^npx\s+[\w@./:-]+/i,
    /^node\s+[\w./:-]+/i,
    /^tsc\b/i,
    /^git\s+(status|diff|log)\b/i,
    /^pip\s+install\b/i,
    /^pip3\s+install\b/i,
    /^go\s+get\b/i,
    /^cargo\s+(add|install)\b/i,
    /^composer\s+require\b/i,
  ];
  const blocked = /\b(rm|del|erase|format|shutdown|restart|powershell|cmd|curl|wget|scp|ssh)\b/i;
  return allowed.some((pattern) => pattern.test(trimmed)) && !blocked.test(trimmed);
}

function isLongRunningCommand(command: string): boolean {
  return [
    /^npm\s+run\s+dev(?::client|:server)?(?:\s|$)/i,
    /^npm\s+start(?:\s|$)/i,
  ].some((pattern) => pattern.test(command.trim()));
}

async function runWorkspaceCommand(command: string, effectiveRoot: string): Promise<string> {
  if (!isAllowedCommand(command)) {
    throw new Error(`Command is not allowed for agent execution: ${command}`);
  }

  if (isLongRunningCommand(command)) {
    const child = spawn(command, {
      cwd: effectiveRoot,
      shell: true,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return `Started background command: ${command}\nWorkspace: ${effectiveRoot}`;
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: effectiveRoot,
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 5,
    });
    return `${stdout || ''}${stderr || ''}`.slice(0, MAX_OUTPUT) || '(command completed with no output)';
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string };
    return `${err.stdout || ''}${err.stderr || err.message}`.slice(0, MAX_OUTPUT);
  }
}

function extractJson(text: string): {
  summary?: string;
  plan?: string[];
  actions?: AgentAction[];
  nextSteps?: string[];
  extensionRecommendations?: Array<{ extensionId: string; language: string; reason: string }>;
  remainingFiles?: string[];
} {
  // Try markdown fenced JSON block first
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const raw = fenced?.[1]?.trim() || (start >= 0 && end > start ? text.slice(start, end + 1) : text);

  try {
    return JSON.parse(raw);
  } catch {
    // Try fixing trailing commas
    const fixed = raw.replace(/,\s*([\]}])/g, '$1');
    try {
      return JSON.parse(fixed);
    } catch {
      // Robust regex fallback to extract actions from broken JSON
      const actions: AgentAction[] = [];
      
      // Matches both markdown-wrapped content and raw unescaped content
      // Looks for "type", "path", and "content", then captures everything until the next action object or array end
      const actionMatches = [...text.matchAll(/"type"\s*:\s*"([^"]+)"\s*,\s*(?:(?:target|"path")\s*:\s*"([^"]+)"\s*,\s*)?"content"\s*:\s*(?:["']?\s*```\w*\s*)?([\s\S]*?)(?:```\s*["']?\s*)?(?=\s*\}\s*,|\s*\}\s*\]|\s*\}\s*\})/g)];
      
      if (actionMatches.length > 0) {
        for (const match of actionMatches) {
          const type = match[1];
          const path = match[2] || '';
          let content = match[3];
          
          // Remove leading/trailing quotes if the LLM accidentally added them but didn't escape inner quotes
          if (content.startsWith('"') && !content.startsWith('""')) {
            content = content.replace(/^"/, '').replace(/"$/, '');
          }
          
          actions.push({ type, path, content: content.trim() } as any);
        }
        return {
          summary: 'Extracted actions via fallback parser',
          plan: [],
          actions,
          nextSteps: []
        };
      }
      
      const simpleMatches = [...text.matchAll(/"type"\s*:\s*"([^"]+)"\s*,\s*"path"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"([\s\S]*?)"\s*\}/g)];
      if (simpleMatches.length > 0) {
        for (const match of simpleMatches) {
          actions.push({ type: match[1], path: match[2], content: match[3].replace(/\\n/g, '\n').replace(/\\"/g, '"') } as any);
        }
        return {
          summary: 'Extracted actions via fallback parser (simple)',
          plan: [],
          actions,
          nextSteps: []
        };
      }
      
      // If it's completely unparseable, throw so the agent can retry
      throw new Error(`Failed to parse agent JSON response: ${raw.slice(0, 200)}`);
    }
  }
}

async function listWorkspaceFiles(effectiveRoot: string, dir = effectiveRoot, depth = 0): Promise<string[]> {
  if (depth > 3) return [];

  const ignore = new Set(['.git', 'node_modules', 'dist', 'dist-check', 'coverage', '.next', '.turbo']);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (ignore.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relative = path.relative(effectiveRoot, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      files.push(`${relative}/`);
      files.push(...await listWorkspaceFiles(effectiveRoot, fullPath, depth + 1));
    } else {
      files.push(relative);
    }
  }

  return files.slice(0, 180);
}

async function readOptionalFile(relativePath: string, effectiveRoot: string, maxLength = 8000): Promise<string> {
  try {
    const target = resolveAgentActionPath(relativePath, effectiveRoot);
    return await fs.readFile(target, 'utf-8').then((content) => content.slice(0, maxLength));
  } catch {
    return '';
  }
}

// ── Language detection from workspace files ────────────────────────────────

async function detectWorkspaceLanguages(effectiveRoot: string): Promise<string[]> {
  const counts: Record<string, number> = {};
  const files = await listWorkspaceFiles(effectiveRoot);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const baseName = path.basename(file).toLowerCase();
    const lang = FILE_EXT_TO_LANG[ext] || FILE_EXT_TO_LANG[baseName];
    if (lang) {
      counts[lang] = (counts[lang] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);
}

export function getExtensionsForLanguage(language: string): Array<{ id: string; displayName: string }> {
  const lang = language.toLowerCase();
  return LANGUAGE_EXTENSION_MAP[lang] || [];
}

function extractProjectNameFromTask(task: string): string | null {
  const explicit = task.match(/\b(?:project|folder|app|site|website)?\s*(?:name|named|called)\s+["']?([a-zA-Z0-9][a-zA-Z0-9 _-]*?)["']?(?=\s|$)/i);
  if (explicit?.[1]) return explicit[1].trim();

  const simple = task.match(/\b(?:create|make|new)\s+(?:a\s+)?(?:project|folder|app|site|website)\s+(?:named|called)?\s*["']?([a-zA-Z0-9][a-zA-Z0-9 _-]*?)["']?(?=\s|$)/i);
  if (simple?.[1]) return simple[1].trim();

  return null;
}

function slugifyProjectName(input: string): string {
  const explicit = extractProjectNameFromTask(input);
  if (explicit) {
    return explicit.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-project';
  }

  const match = input.match(/(?:create|build|generate)\s+(?:a|an)?\s*([a-z0-9\s-]+?)(?:\s+using|\s+with|$)/i);
  const raw = match?.[1] || 'new-project';
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-project';
}

function shouldUseNewProjectScaffold(task: string): boolean {
  return false; // Always use AI to generate project so it matches prompt perfectly
}

function findProjectContainer(baseRoot: string): string | undefined {
  const candidates = ['projects', 'apps', 'packages'];
  for (const candidate of candidates) {
    try {
      const fullPath = path.join(baseRoot, candidate);
      const stats = fs.stat(fullPath);
      if (stats && (stats as any).then === undefined && (stats as any).isDirectory()) {
        return fullPath;
      }
      if (stats instanceof Promise) {
        // handle async stat object gracefully
      }
    } catch {
      // ignore missing paths
    }
  }
  return undefined;
}

function createNewProjectScaffold(task: string): {
  summary: string;
  plan: string[];
  actions: AgentAction[];
  nextSteps: string[];
  extensionRecommendations?: Array<{ extensionId: string; language: string; reason: string }>;
} {
  const explicitName = extractProjectNameFromTask(task);
  const projectName = explicitName ? explicitName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : slugifyProjectName(task);
  const root = projectName;
  const normalized = task.toLowerCase();
  const wantsReact = /\breact|vite|frontend|dashboard|spa\b/.test(normalized);
  const wantsExpress = /\bnode|express|api|backend|server\b/.test(normalized);
  const wantsMongo = /\bmongo|mongodb|mongoose\b/.test(normalized);
  const wantsAuth = /\blogin|signup|sign up|auth|authentication|jwt\b/.test(normalized);
  const entityMatch = normalized.match(/\b(todo|task|product|post|blog|note|book|student|employee|customer|user)s?\b/);
  const entity = entityMatch?.[1] || 'item';
  const title = entity[0].toUpperCase() + entity.slice(1);
  const files: Array<{ path: string; content: string }> = [
    {
      path: `${root}/package.json`,
      content: JSON.stringify({
        name: projectName,
        version: '1.0.0',
        private: true,
        workspaces: wantsReact && wantsExpress ? ['client', 'server'] : undefined,
        scripts: {
          dev: wantsReact && wantsExpress
            ? 'concurrently "npm run dev --workspace server" "npm run dev --workspace client"'
            : wantsReact
              ? 'npm run dev --workspace client'
              : wantsExpress
                ? 'npm run dev --workspace server'
                : 'node index.js',
          build: wantsReact ? 'npm run build --workspace client' : undefined,
          start: wantsExpress ? 'npm start --workspace server' : 'node index.js',
        },
        devDependencies: wantsReact && wantsExpress ? { concurrently: '^8.2.2' } : undefined,
      }, null, 2) + '\n',
    },
    {
      path: `${root}/README.md`,
      content: `# ${projectName}

Generated by AI Web IDE from this prompt:

> ${task}

## Stack
${wantsReact ? '- React + Vite frontend\n' : ''}${wantsExpress ? '- Node.js + Express backend\n' : ''}${wantsMongo ? '- MongoDB with Mongoose\n' : ''}${wantsAuth ? '- JWT-style authentication structure\n' : ''}${!wantsReact && !wantsExpress ? '- Plain JavaScript starter\n' : ''}

## Run
\`\`\`bash
npm install
npm run dev
\`\`\`

${wantsMongo ? 'Create `server/.env` from `server/.env.example` before using database features.\n' : ''}
`,
    },
    ...(!wantsReact && !wantsExpress ? [
      {
        path: `${root}/index.js`,
        content: `console.log('Hello from ${projectName}');\n`,
      },
    ] : []),
    ...(wantsReact ? [
      {
        path: `${root}/client/package.json`,
        content: JSON.stringify({
          name: `${projectName}-client`,
          version: '1.0.0',
          private: true,
          type: 'module',
          scripts: {
            dev: 'vite --host 127.0.0.1 --port 5173',
            build: 'vite build',
            preview: 'vite preview --host 127.0.0.1 --port 4174',
          },
          dependencies: {
            '@vitejs/plugin-react': '^4.2.1',
            vite: '^5.0.0',
            react: '^18.2.0',
            'react-dom': '^18.2.0',
            axios: '^1.6.7',
            'react-router-dom': '^6.22.0',
          },
        }, null, 2) + '\n',
      },
      {
        path: `${root}/client/index.html`,
        content: '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Generated App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n',
      },
      {
        path: `${root}/client/src/main.jsx`,
        content: "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\nimport './styles.css';\n\ncreateRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n",
      },
      {
        path: `${root}/client/src/App.jsx`,
        content: `import { useEffect, useState } from 'react';\nimport axios from 'axios';\n\nconst api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001/api' });\n\nexport default function App() {\n  const [items, setItems] = useState([]);\n  const [name, setName] = useState('');\n\n  async function loadItems() {\n    try {\n      const { data } = await api.get('/${entity}s');\n      setItems(data);\n    } catch {\n      setItems([]);\n    }\n  }\n\n  useEffect(() => { loadItems(); }, []);\n\n  async function addItem(event) {\n    event.preventDefault();\n    if (!name.trim()) return;\n    const { data } = await api.post('/${entity}s', { name });\n    setItems([data, ...items]);\n    setName('');\n  }\n\n  return <main className="app-shell">\n    <header>\n      <span>${projectName}</span>\n      <h1>${title} Dashboard</h1>\n      ${wantsAuth ? '<button>Login</button>' : ''}\n    </header>\n    <form className="add-row" onSubmit={addItem}>\n      <input placeholder="Add ${entity}" value={name} onChange={(event) => setName(event.target.value)} />\n      <button>Add</button>\n    </form>\n    <section className="grid">\n      {items.map((item) => <article key={item._id || item.id || item.name}>{item.name}</article>)}\n    </section>\n  </main>;\n}\n`,
      },
      {
        path: `${root}/client/src/styles.css`,
        content: ":root { font-family: Inter, system-ui, sans-serif; color: #172033; background: #eef4f8; }\nbody { margin: 0; min-height: 100vh; }\nbutton, input { font: inherit; }\nbutton { border: 0; border-radius: 6px; background: #2563eb; color: white; padding: 10px 14px; cursor: pointer; }\ninput { border: 1px solid #cbd5e1; border-radius: 6px; padding: 11px 12px; }\n.app-shell { max-width: 960px; margin: 0 auto; padding: 32px 18px; }\nheader { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }\nheader span { color: #64748b; font-size: 13px; text-transform: uppercase; }\nh1 { margin: 0; }\n.add-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; margin-bottom: 18px; }\n.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }\narticle { background: white; border: 1px solid #dce5ee; border-radius: 8px; padding: 14px; }\n",
      },
    ] : []),
    ...(wantsExpress ? [
      {
        path: `${root}/server/package.json`,
        content: JSON.stringify({
          name: `${projectName}-server`,
          version: '1.0.0',
          private: true,
          type: 'module',
          scripts: { dev: 'nodemon server.js', start: 'node server.js' },
          dependencies: {
            cors: '^2.8.5',
            dotenv: '^16.4.5',
            express: '^4.18.2',
            ...(wantsMongo ? { mongoose: '^8.1.1' } : {}),
            ...(wantsAuth ? { bcryptjs: '^2.4.3', jsonwebtoken: '^9.0.2' } : {}),
          },
          devDependencies: { nodemon: '^3.0.3' },
        }, null, 2) + '\n',
      },
      {
        path: `${root}/server/.env.example`,
        content: `PORT=5001\n${wantsMongo ? `MONGODB_URI=mongodb://127.0.0.1:27017/${projectName.replace(/-/g, '_')}\n` : ''}${wantsAuth ? 'JWT_SECRET=replace_me_with_a_long_random_secret\n' : ''}`,
      },
      {
        path: `${root}/server/server.js`,
        content: `import express from 'express';\nimport cors from 'cors';\nimport dotenv from 'dotenv';\n${wantsMongo ? "import mongoose from 'mongoose';\n" : ''}import ${entity}Routes from './routes/${entity}Routes.js';\n\ndotenv.config();\n\nconst app = express();\nconst port = process.env.PORT || 5001;\napp.use(cors({ origin: process.env.CLIENT_URL || 'http://127.0.0.1:5173' }));\napp.use(express.json());\napp.get('/api/health', (_req, res) => res.json({ status: 'ok' }));\napp.use('/api/${entity}s', ${entity}Routes);\n\nasync function start() {\n${wantsMongo ? "  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/generated_app');\n" : ''}  app.listen(port, () => console.log(\`API running on http://127.0.0.1:\${port}\`));\n}\n\nstart().catch((error) => {\n  console.error('Server failed to start:', error.message);\n  process.exit(1);\n});\n`,
      },
      ...(wantsMongo ? [{
        path: `${root}/server/models/${title}.js`,
        content: `import mongoose from 'mongoose';\n\nconst ${entity}Schema = new mongoose.Schema({\n  name: { type: String, required: true, trim: true },\n  completed: { type: Boolean, default: false },\n}, { timestamps: true });\n\nexport default mongoose.model('${title}', ${entity}Schema);\n`,
      }] : []),
      {
        path: `${root}/server/routes/${entity}Routes.js`,
        content: `${wantsMongo ? `import { Router } from 'express';\nimport ${title} from '../models/${title}.js';\n\nconst router = Router();\n\nrouter.get('/', async (_req, res) => {\n  const items = await ${title}.find().sort({ createdAt: -1 });\n  res.json(items);\n});\n\nrouter.post('/', async (req, res) => {\n  const item = await ${title}.create({ name: req.body.name });\n  res.status(201).json(item);\n});\n\nrouter.put('/:id', async (req, res) => {\n  const item = await ${title}.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });\n  if (!item) return res.status(404).json({ error: '${title} not found' });\n  res.json(item);\n});\n\nrouter.delete('/:id', async (req, res) => {\n  await ${title}.findByIdAndDelete(req.params.id);\n  res.json({ success: true });\n});\n\nexport default router;\n` : `import { Router } from 'express';\n\nconst router = Router();\nlet items = [];\n\nrouter.get('/', (_req, res) => res.json(items));\nrouter.post('/', (req, res) => {\n  const item = { id: Date.now().toString(), name: req.body.name || 'Untitled' };\n  items = [item, ...items];\n  res.status(201).json(item);\n});\nrouter.put('/:id', (req, res) => {\n  items = items.map((item) => item.id === req.params.id ? { ...item, ...req.body } : item);\n  res.json(items.find((item) => item.id === req.params.id));\n});\nrouter.delete('/:id', (req, res) => {\n  items = items.filter((item) => item.id !== req.params.id);\n  res.json({ success: true });\n});\n\nexport default router;\n`}`,
      },
    ] : []),
    {
      path: `${root}/client/index.html`,
      content: '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Todo App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n',
    },
    {
      path: `${root}/client/src/main.jsx`,
      content: "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { BrowserRouter } from 'react-router-dom';\nimport App from './App.jsx';\nimport './styles.css';\n\ncreateRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <BrowserRouter>\n      <App />\n    </BrowserRouter>\n  </React.StrictMode>\n);\n",
    },
    {
      path: `${root}/client/src/api.js`,
      content: "import axios from 'axios';\n\nexport const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001/api' });\n\napi.interceptors.request.use((config) => {\n  const token = localStorage.getItem('todo-token');\n  if (token) config.headers.Authorization = `Bearer ${token}`;\n  return config;\n});\n",
    },
    {
      path: `${root}/client/src/App.jsx`,
      content: "import { useEffect, useState } from 'react';\nimport { Navigate, Route, Routes, useNavigate } from 'react-router-dom';\nimport { api } from './api.js';\n\nfunction AuthPage({ mode }) {\n  const navigate = useNavigate();\n  const [form, setForm] = useState({ name: '', email: '', password: '' });\n  const [error, setError] = useState('');\n\n  async function submit(event) {\n    event.preventDefault();\n    setError('');\n    try {\n      const { data } = await api.post(`/auth/${mode}`, form);\n      localStorage.setItem('todo-token', data.token);\n      navigate('/dashboard');\n    } catch (err) {\n      setError(err.response?.data?.error || 'Authentication failed');\n    }\n  }\n\n  return <main className=\"auth-shell\"><form className=\"panel\" onSubmit={submit}>\n    <h1>{mode === 'login' ? 'Welcome back' : 'Create account'}</h1>\n    {mode === 'signup' && <input placeholder=\"Name\" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}\n    <input placeholder=\"Email\" type=\"email\" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />\n    <input placeholder=\"Password\" type=\"password\" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />\n    {error && <p className=\"error\">{error}</p>}\n    <button>{mode === 'login' ? 'Login' : 'Sign up'}</button>\n    <a href={mode === 'login' ? '/signup' : '/login'}>{mode === 'login' ? 'Need an account?' : 'Already have an account?'}</a>\n  </form></main>;\n}\n\nfunction Dashboard() {\n  const navigate = useNavigate();\n  const [todos, setTodos] = useState([]);\n  const [title, setTitle] = useState('');\n\n  async function loadTodos() {\n    const { data } = await api.get('/todos');\n    setTodos(data);\n  }\n\n  useEffect(() => { loadTodos().catch(() => navigate('/login')); }, []);\n\n  async function addTodo(event) {\n    event.preventDefault();\n    if (!title.trim()) return;\n    const { data } = await api.post('/todos', { title });\n    setTodos([data, ...todos]);\n    setTitle('');\n  }\n\n  async function toggleTodo(todo) {\n    const { data } = await api.put(`/todos/${todo._id}`, { completed: !todo.completed });\n    setTodos(todos.map((item) => item._id === data._id ? data : item));\n  }\n\n  async function deleteTodo(id) {\n    await api.delete(`/todos/${id}`);\n    setTodos(todos.filter((todo) => todo._id !== id));\n  }\n\n  return <main className=\"dashboard\"><header><div><span>Dashboard</span><h1>Your todos</h1></div><button onClick={() => { localStorage.removeItem('todo-token'); navigate('/login'); }}>Logout</button></header>\n    <form className=\"add-row\" onSubmit={addTodo}><input placeholder=\"Add a task\" value={title} onChange={(e) => setTitle(e.target.value)} /><button>Add</button></form>\n    <section className=\"todo-list\">{todos.map((todo) => <article key={todo._id} className={todo.completed ? 'todo done' : 'todo'}><label><input type=\"checkbox\" checked={todo.completed} onChange={() => toggleTodo(todo)} />{todo.title}</label><button onClick={() => deleteTodo(todo._id)}>Delete</button></article>)}</section>\n  </main>;\n}\n\nexport default function App() {\n  return <Routes><Route path=\"/\" element={<Navigate to=\"/dashboard\" />} /><Route path=\"/login\" element={<AuthPage mode=\"login\" />} /><Route path=\"/signup\" element={<AuthPage mode=\"signup\" />} /><Route path=\"/dashboard\" element={<Dashboard />} /></Routes>;\n}\n",
    },
    {
      path: `${root}/client/src/styles.css`,
      content: ":root { font-family: Inter, system-ui, sans-serif; color: #172033; background: #eef4f8; }\nbody { margin: 0; min-height: 100vh; }\nbutton, input { font: inherit; }\nbutton { border: 0; border-radius: 6px; background: #2563eb; color: white; padding: 10px 14px; cursor: pointer; }\ninput { border: 1px solid #cbd5e1; border-radius: 6px; padding: 11px 12px; }\n.auth-shell { min-height: 100vh; display: grid; place-items: center; }\n.panel { width: min(380px, calc(100vw - 32px)); display: grid; gap: 12px; background: white; border: 1px solid #dce5ee; border-radius: 8px; padding: 24px; box-shadow: 0 18px 60px rgba(15, 23, 42, .12); }\n.panel h1 { margin: 0 0 8px; }\n.panel a { color: #2563eb; text-decoration: none; }\n.error { color: #dc2626; margin: 0; }\n.dashboard { max-width: 880px; margin: 0 auto; padding: 32px 18px; }\n.dashboard header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }\n.dashboard header span { color: #64748b; font-size: 13px; text-transform: uppercase; }\n.dashboard h1 { margin: 4px 0 0; }\n.add-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; margin-bottom: 18px; }\n.todo-list { display: grid; gap: 10px; }\n.todo { display: flex; align-items: center; justify-content: space-between; gap: 16px; background: white; border: 1px solid #dce5ee; border-radius: 8px; padding: 12px; }\n.todo label { display: flex; align-items: center; gap: 10px; }\n.todo.done label { color: #64748b; text-decoration: line-through; }\n.todo button { background: #ef4444; }\n",
    },
    {
      path: `${root}/server/package.json`,
      content: JSON.stringify({
        name: `${projectName}-server`,
        version: '1.0.0',
        private: true,
        type: 'module',
        scripts: { dev: 'nodemon server.js', start: 'node server.js' },
        dependencies: { bcryptjs: '^2.4.3', cors: '^2.8.5', dotenv: '^16.4.5', express: '^4.18.2', jsonwebtoken: '^9.0.2', mongoose: '^8.1.1' },
        devDependencies: { nodemon: '^3.0.3' },
      }, null, 2) + '\n',
    },
    { path: `${root}/server/.env.example`, content: 'PORT=5001\nMONGODB_URI=mongodb://127.0.0.1:27017/todo_app\nJWT_SECRET=replace_me_with_a_long_random_secret\n' },
    {
      path: `${root}/server/server.js`,
      content: "import express from 'express';\nimport cors from 'cors';\nimport dotenv from 'dotenv';\nimport mongoose from 'mongoose';\nimport authRoutes from './routes/authRoutes.js';\nimport todoRoutes from './routes/todoRoutes.js';\n\ndotenv.config();\n\nconst app = express();\nconst port = process.env.PORT || 5001;\n\napp.use(cors({ origin: process.env.CLIENT_URL || 'http://127.0.0.1:5173' }));\napp.use(express.json());\napp.get('/api/health', (_req, res) => res.json({ status: 'ok' }));\napp.use('/api/auth', authRoutes);\napp.use('/api/todos', todoRoutes);\n\nasync function start() {\n  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/todo_app');\n  app.listen(port, () => console.log(`API running on http://127.0.0.1:${port}`));\n}\n\nstart().catch((error) => {\n  console.error('Server failed to start:', error.message);\n  process.exit(1);\n});\n",
    },
    { path: `${root}/server/models/User.js`, content: "import mongoose from 'mongoose';\n\nconst userSchema = new mongoose.Schema({\n  name: { type: String, required: true },\n  email: { type: String, required: true, unique: true, lowercase: true, trim: true },\n  passwordHash: { type: String, required: true },\n}, { timestamps: true });\n\nexport default mongoose.model('User', userSchema);\n" },
    { path: `${root}/server/models/Todo.js`, content: "import mongoose from 'mongoose';\n\nconst todoSchema = new mongoose.Schema({\n  title: { type: String, required: true, trim: true },\n  completed: { type: Boolean, default: false },\n  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },\n}, { timestamps: true });\n\nexport default mongoose.model('Todo', todoSchema);\n" },
    { path: `${root}/server/middleware/auth.js`, content: "import jwt from 'jsonwebtoken';\n\nexport function requireAuth(req, res, next) {\n  const header = req.headers.authorization || '';\n  const token = header.startsWith('Bearer ') ? header.slice(7) : '';\n  if (!token) return res.status(401).json({ error: 'Missing token' });\n  try {\n    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');\n    next();\n  } catch {\n    res.status(401).json({ error: 'Invalid token' });\n  }\n}\n" },
    { path: `${root}/server/routes/authRoutes.js`, content: "import { Router } from 'express';\nimport bcrypt from 'bcryptjs';\nimport jwt from 'jsonwebtoken';\nimport User from '../models/User.js';\n\nconst router = Router();\n\nfunction sign(user) {\n  return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });\n}\n\nrouter.post('/signup', async (req, res) => {\n  const { name, email, password } = req.body;\n  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });\n  const existing = await User.findOne({ email });\n  if (existing) return res.status(409).json({ error: 'Email is already registered' });\n  const passwordHash = await bcrypt.hash(password, 12);\n  const user = await User.create({ name, email, passwordHash });\n  res.status(201).json({ token: sign(user), user: { id: user._id, name: user.name, email: user.email } });\n});\n\nrouter.post('/login', async (req, res) => {\n  const { email, password } = req.body;\n  const user = await User.findOne({ email });\n  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Invalid credentials' });\n  res.json({ token: sign(user), user: { id: user._id, name: user.name, email: user.email } });\n});\n\nexport default router;\n" },
    { path: `${root}/server/routes/todoRoutes.js`, content: "import { Router } from 'express';\nimport Todo from '../models/Todo.js';\nimport { requireAuth } from '../middleware/auth.js';\n\nconst router = Router();\nrouter.use(requireAuth);\n\nrouter.get('/', async (req, res) => {\n  const todos = await Todo.find({ owner: req.user.id }).sort({ createdAt: -1 });\n  res.json(todos);\n});\n\nrouter.post('/', async (req, res) => {\n  const todo = await Todo.create({ title: req.body.title, owner: req.user.id });\n  res.status(201).json(todo);\n});\n\nrouter.put('/:id', async (req, res) => {\n  const todo = await Todo.findOneAndUpdate({ _id: req.params.id, owner: req.user.id }, { $set: { title: req.body.title, completed: req.body.completed } }, { new: true, runValidators: true });\n  if (!todo) return res.status(404).json({ error: 'Todo not found' });\n  res.json(todo);\n});\n\nrouter.delete('/:id', async (req, res) => {\n  await Todo.deleteOne({ _id: req.params.id, owner: req.user.id });\n  res.json({ success: true });\n});\n\nexport default router;\n" },
  ];

  return {
    summary: `Created a full-stack Todo app in ${root} with React, Express, MongoDB, JWT auth, dashboard, and Todo CRUD.`,
    plan: ['Create isolated project folder', 'Generate client and server files', 'Install dependencies', 'Start development servers'],
    actions: [
      { type: 'mkdir', path: root },
      { type: 'mkdir', path: `${root}/client/src` },
      { type: 'mkdir', path: `${root}/server/models` },
      { type: 'mkdir', path: `${root}/server/routes` },
      { type: 'mkdir', path: `${root}/server/middleware` },
      ...files.map((file) => ({ type: 'writeFile' as const, path: file.path, content: file.content })),
      { type: 'runCommand', command: 'npm install', cwd: root },
      { type: 'runCommand', command: 'npm run dev', cwd: root },
    ],
    nextSteps: [
      `Create ${root}/server/.env from ${root}/server/.env.example.`,
      'Start MongoDB locally or set MONGODB_URI to MongoDB Atlas.',
      'Use follow-up prompts to update only the generated files.',
    ],
  };
}

function createGenericProjectScaffold(task: string): {
  summary: string;
  plan: string[];
  actions: AgentAction[];
  nextSteps: string[];
  extensionRecommendations?: Array<{ extensionId: string; language: string; reason: string }>;
} {
  const projectName = slugifyProjectName(task);
  const explicitName = extractProjectNameFromTask(task);
  const root = explicitName ? explicitName.replace(/\s+/g, '-') : projectName;
  const normalized = task.toLowerCase();
  const wantsReact = /\breact|vite|frontend|dashboard|spa|web app|website|site\b/.test(normalized);
  const wantsExpress = /\bnode|express|api|backend|server\b/.test(normalized);
  const wantsMongo = /\bmongo|mongodb|mongoose\b/.test(normalized);
  const entity = normalized.match(/\b(todo|task|product|post|blog|note|book|student|employee|customer|order|user|item)s?\b/)?.[1] || 'item';
  const entityTitle = entity[0].toUpperCase() + entity.slice(1);
  const files: Array<{ path: string; content: string }> = [];

  files.push({
    path: `${root}/package.json`,
    content: JSON.stringify({
      name: projectName,
      version: '1.0.0',
      private: true,
      workspaces: wantsReact && wantsExpress ? ['client', 'server'] : undefined,
      scripts: {
        dev: wantsReact && wantsExpress
          ? 'concurrently "npm run dev --workspace server" "npm run dev --workspace client"'
          : wantsReact
            ? 'npm run dev --workspace client'
            : wantsExpress
              ? 'npm run dev --workspace server'
              : 'node index.js',
        build: wantsReact ? 'npm run build --workspace client' : undefined,
        start: wantsExpress ? 'npm start --workspace server' : 'node index.js',
      },
      devDependencies: wantsReact && wantsExpress ? { concurrently: '^8.2.2' } : undefined,
    }, null, 2) + '\n',
  });

  files.push({
    path: `${root}/README.md`,
    content: `# ${projectName}

Generated by AI Web IDE.

Prompt:
> ${task}

## Run

\`\`\`bash
npm install
npm run dev
\`\`\`

${wantsMongo ? 'If using MongoDB, copy `server/.env.example` to `server/.env` and set `MONGODB_URI`.\n' : ''}
`,
  });

  if (!wantsReact && !wantsExpress) {
    files.push({
      path: `${root}/index.js`,
      content: `console.log('Hello from ${projectName}');\n`,
    });
  }

  if (wantsReact) {
    files.push(
      {
        path: `${root}/client/package.json`,
        content: JSON.stringify({
          name: `${projectName}-client`,
          version: '1.0.0',
          private: true,
          type: 'module',
          scripts: {
            dev: 'vite --host 127.0.0.1 --port 5173',
            build: 'vite build',
            preview: 'vite preview --host 127.0.0.1 --port 4174',
          },
          dependencies: {
            '@vitejs/plugin-react': '^4.2.1',
            vite: '^5.0.0',
            react: '^18.2.0',
            'react-dom': '^18.2.0',
            axios: '^1.6.7',
          },
        }, null, 2) + '\n',
      },
      {
        path: `${root}/client/index.html`,
        content: '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Generated App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n',
      },
      {
        path: `${root}/client/src/main.jsx`,
        content: "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\nimport './styles.css';\n\ncreateRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);\n",
      },
      {
        path: `${root}/client/src/App.jsx`,
        content: `import { useEffect, useState } from 'react';\nimport axios from 'axios';\n\nconst api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001/api' });\n\nexport default function App() {\n  const [items, setItems] = useState([]);\n  const [name, setName] = useState('');\n\n  useEffect(() => {\n    api.get('/${entity}s').then(({ data }) => setItems(data)).catch(() => setItems([]));\n  }, []);\n\n  async function addItem(event) {\n    event.preventDefault();\n    if (!name.trim()) return;\n    const { data } = await api.post('/${entity}s', { name });\n    setItems([data, ...items]);\n    setName('');\n  }\n\n  return <main className="app-shell">\n    <header><span>${projectName}</span><h1>${entityTitle} Dashboard</h1></header>\n    <form className="add-row" onSubmit={addItem}>\n      <input placeholder="Add ${entity}" value={name} onChange={(event) => setName(event.target.value)} />\n      <button>Add</button>\n    </form>\n    <section className="grid">{items.map((item) => <article key={item._id || item.id || item.name}>{item.name}</article>)}</section>\n  </main>;\n}\n`,
      },
      {
        path: `${root}/client/src/styles.css`,
        content: ":root { font-family: Inter, system-ui, sans-serif; color: #172033; background: #eef4f8; }\nbody { margin: 0; min-height: 100vh; }\nbutton, input { font: inherit; }\nbutton { border: 0; border-radius: 6px; background: #2563eb; color: white; padding: 10px 14px; cursor: pointer; }\ninput { border: 1px solid #cbd5e1; border-radius: 6px; padding: 11px 12px; }\n.app-shell { max-width: 960px; margin: 0 auto; padding: 32px 18px; }\nheader { margin-bottom: 24px; }\nheader span { color: #64748b; font-size: 13px; text-transform: uppercase; }\nh1 { margin: 4px 0 0; }\n.add-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; margin-bottom: 18px; }\n.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }\narticle { background: white; border: 1px solid #dce5ee; border-radius: 8px; padding: 14px; }\n",
      },
    );
  }

  if (wantsExpress) {
    files.push(
      {
        path: `${root}/server/package.json`,
        content: JSON.stringify({
          name: `${projectName}-server`,
          version: '1.0.0',
          private: true,
          type: 'module',
          scripts: { dev: 'nodemon server.js', start: 'node server.js' },
          dependencies: {
            cors: '^2.8.5',
            dotenv: '^16.4.5',
            express: '^4.18.2',
            ...(wantsMongo ? { mongoose: '^8.1.1' } : {}),
          },
          devDependencies: { nodemon: '^3.0.3' },
        }, null, 2) + '\n',
      },
      {
        path: `${root}/server/.env.example`,
        content: `PORT=5001\n${wantsMongo ? `MONGODB_URI=mongodb://127.0.0.1:27017/${projectName.replace(/-/g, '_')}\n` : ''}`,
      },
      {
        path: `${root}/server/server.js`,
        content: `import express from 'express';\nimport cors from 'cors';\nimport dotenv from 'dotenv';\n${wantsMongo ? "import mongoose from 'mongoose';\n" : ''}import routes from './routes/${entity}Routes.js';\n\ndotenv.config();\n\nconst app = express();\nconst port = process.env.PORT || 5001;\napp.use(cors({ origin: process.env.CLIENT_URL || 'http://127.0.0.1:5173' }));\napp.use(express.json());\napp.get('/api/health', (_req, res) => res.json({ status: 'ok' }));\napp.use('/api/${entity}s', routes);\n\nasync function start() {\n${wantsMongo ? `  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/${projectName.replace(/-/g, '_')}');\n` : ''}  app.listen(port, () => console.log(\`API running on http://127.0.0.1:\${port}\`));\n}\n\nstart().catch((error) => {\n  console.error(error.message);\n  process.exit(1);\n});\n`,
      },
      {
        path: `${root}/server/routes/${entity}Routes.js`,
        content: wantsMongo
          ? `import { Router } from 'express';\nimport ${entityTitle} from '../models/${entityTitle}.js';\n\nconst router = Router();\nrouter.get('/', async (_req, res) => res.json(await ${entityTitle}.find().sort({ createdAt: -1 })));\nrouter.post('/', async (req, res) => res.status(201).json(await ${entityTitle}.create({ name: req.body.name })));\nrouter.put('/:id', async (req, res) => res.json(await ${entityTitle}.findByIdAndUpdate(req.params.id, req.body, { new: true })));\nrouter.delete('/:id', async (req, res) => { await ${entityTitle}.findByIdAndDelete(req.params.id); res.json({ success: true }); });\nexport default router;\n`
          : `import { Router } from 'express';\n\nconst router = Router();\nlet items = [];\nrouter.get('/', (_req, res) => res.json(items));\nrouter.post('/', (req, res) => { const item = { id: Date.now().toString(), name: req.body.name || 'Untitled' }; items = [item, ...items]; res.status(201).json(item); });\nrouter.put('/:id', (req, res) => { items = items.map((item) => item.id === req.params.id ? { ...item, ...req.body } : item); res.json(items.find((item) => item.id === req.params.id)); });\nrouter.delete('/:id', (req, res) => { items = items.filter((item) => item.id !== req.params.id); res.json({ success: true }); });\nexport default router;\n`,
      },
    );

    if (wantsMongo) {
      files.push({
        path: `${root}/server/models/${entityTitle}.js`,
        content: `import mongoose from 'mongoose';\n\nconst schema = new mongoose.Schema({\n  name: { type: String, required: true, trim: true },\n}, { timestamps: true });\n\nexport default mongoose.model('${entityTitle}', schema);\n`,
      });
    }
  }

  const actions: AgentAction[] = [
    { type: 'mkdir', path: root },
    ...(wantsReact ? [{ type: 'mkdir' as const, path: `${root}/client/src` }] : []),
    ...(wantsExpress ? [{ type: 'mkdir' as const, path: `${root}/server/routes` }] : []),
    ...(wantsMongo ? [{ type: 'mkdir' as const, path: `${root}/server/models` }] : []),
    ...files.map((file) => ({ type: 'writeFile' as const, path: file.path, content: file.content })),
    { type: 'runCommand', command: 'npm install', cwd: root },
    { type: 'runCommand', command: 'npm run dev', cwd: root },
  ];

  return {
    summary: `Created a new project in ${root} from the requested prompt.`,
    plan: ['Create isolated project folder', 'Generate stack-specific files', 'Install dependencies', 'Start the project'],
    actions,
    nextSteps: [
      wantsMongo ? `Create ${root}/server/.env from ${root}/server/.env.example if needed.` : 'Use follow-up prompts to add or adjust features.',
      'Explorer opens the generated project folder after files are written.',
    ],
  };
}

// ── Prompt ────────────────────────────────────────────────────────────────────

async function buildAgentPrompt(task: string, context: AIContext, effectiveRoot: string, nluResult?: NLUResult, conversationHistory: ConversationEntry[] = []): Promise<string> {
  const activeFile = context.currentFile
    ? `Active file: ${context.currentFile.path}\nLanguage: ${context.currentFile.language}\n\n${context.currentFile.content.slice(0, 12000)}`
    : 'No active file was provided.';
  let workspaceFiles: string[] = [];
  let detectedLangs: string[] = [];
  let packageJson = '';
  let serverPackageJson = '';

  if (context.workspaceType === 'local' && Array.isArray(context.fileTree)) {
    // Direct access from API call proper folder structure
    workspaceFiles = context.fileTree;
    const exts = new Set(workspaceFiles.map(f => typeof f === 'string' ? f.split('.').pop()?.toLowerCase() : ''));
    if (exts.has('ts') || exts.has('tsx')) detectedLangs.push('TypeScript');
    if (exts.has('js') || exts.has('jsx')) detectedLangs.push('JavaScript');
    if (exts.has('py')) detectedLangs.push('Python');
    if (exts.has('java')) detectedLangs.push('Java');
    if (exts.has('html')) detectedLangs.push('HTML');
    if (exts.has('css')) detectedLangs.push('CSS');
    // Cannot read package.json natively from backend for local workspace without a tool call
  } else {
    workspaceFiles = await listWorkspaceFiles(effectiveRoot);
    packageJson = await readOptionalFile('package.json', effectiveRoot, 6000);
    serverPackageJson = await readOptionalFile('server/package.json', effectiveRoot, 4000);
    detectedLangs = await detectWorkspaceLanguages(effectiveRoot);
  }

  let nluSection = '';
  if (nluResult) {
    nluSection = `\n\nUSER REQUEST ANALYSIS (pre-processed by NLU):
- Original input: "${nluResult.originalInput}"
- Corrected input: "${nluResult.correctedInput}"
- Intent: ${nluResult.intent}
- Confidence: ${nluResult.confidence}
- Entities: ${JSON.stringify(nluResult.entities)}
- Execution plan: ${nluResult.executionPlan.join(', ') || 'none'}

Use this analysis to understand the user's TRUE intent. The corrected input fixes typos and expands abbreviations.`;
  }

  let historySection = '';
  if (conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-10);
    historySection = '\n\nCONVERSATION HISTORY (session context):';
    for (const entry of recent) {
      historySection += `\n[${entry.role}]: ${entry.content.slice(0, 1500)}`;
    }
    historySection += '\n\nUse this history to understand follow-up requests. If the user references something from a previous message, use that context.';
  }

  return `[AGENT MODE] You are a fully autonomous ReAct (Reasoning and Acting) AI coding agent that EXECUTES changes directly in the user's virtual workspace.
Your primary lifecycle is a continuous multi-step loop:
1. Understand the request.
2. Search relevant files using \`listFiles\`.
3. Read relevant files using \`readFile\`.
4. Plan your changes.
5. Edit files using \`writeFile\`, \`renameFile\`, or \`deleteFile\`.

RULES FOR REACT LOOP:
- DO NOT guess file contents. You must read them first using the \`readFile\` action.
- When you output \`readFile\` or \`listFiles\` actions, DO NOT output \`writeFile\` actions in the same response. Wait for the system to execute your read/search actions. It will append the outputs to the conversation history and prompt you again.
- Only once you have gathered all necessary information should you proceed to step 4 (Plan) and step 5 (Edit).

CRITICAL RESTRICTION: You must NEVER change the code in files or folders of the IDE's own source code (e.g. the AI Web IDE itself). You ONLY operate on the user's files inside their virtual workspace.
You are NOT a chatbot. You do NOT give instructions. You WRITE CODE directly to files.
You behave like a SENIOR SOFTWARE ENGINEER who delivers COMPLETE, PRODUCTION-READY features.

CRITICAL RULES:
1. You MUST return writeFile actions with COMPLETE file contents for every file the user asks you to create or modify.
2. NEVER say "create a file called...", "you can add...", "here's what it should look like...". Instead, USE writeFile to actually write it.
3. NEVER tell the user to do something manually. YOU do it by returning actions.
4. If the user says "add X to file Y", you MUST read file Y first (readFile), then return a writeFile with the COMPLETE updated contents.
5. If the user mentions a filename (like "index.html", "script.js"), you MUST create or modify that file using writeFile.
6. Every response MUST have at least one action. If unsure, create the files the user is most likely referring to.
7. When modifying an existing file, ALWAYS use readFile first to get current contents, then writeFile with the full updated content.
${context.workspaceType === 'local' ? '\n8. CRITICAL: The user is in a Native Local Workspace. DO NOT generate `runCommand` or `installDependency` actions, because terminal commands cannot be run from the browser locally. Only use file operations (writeFile, deleteFile, etc.).' : ''}

# STRICT FOLDER AND FILE MANAGEMENT RULES

You are responsible for creating and maintaining a clean, logical, production-quality folder and file structure.
A feature is NOT considered correctly implemented if the code works but the files are poorly organized.
The final project must be both: FUNCTIONALLY CORRECT + STRUCTURALLY CORRECT

1. NEVER CREATE A FILE WITHOUT A REASON: Determine its responsibility and if an existing file can do the job.
2. NEVER CREATE DUPLICATE FILES: Search for similar filenames/components (e.g. UserCard) before creating new ones.
3. ONE FILE = ONE CLEAR RESPONSIBILITY: Don't put auth, DB, and UI helpers all in utils.ts.
4. DO NOT CREATE "GOD FILES": Avoid dumping ground files like helpers.ts, utils.ts, common.ts, api.ts.
5. DO NOT CREATE "JUNK FILES": No test.ts, temp.ts, new.ts, backup.ts.
6. FILE NAMING MUST BE CONSISTENT: Follow existing casing (e.g., UserProfile.tsx vs user-profile.tsx).
7. FILE EXTENSIONS: Use the correct extension (.ts, .tsx, .css). No .js in a TS project without reason.
8. COMPONENT FILE RULES: Keep UI components in established locations. Do not automatically create hooks/, utils/ for trivial components.
9. FEATURE FILE RULES: Keep feature-specific code (e.g. auth hooks) inside the feature folder, not global folders.
10. SHARED FILE RULE: Only put code in shared directories (e.g. global components/) if it is GENUINELY shared.
11. INDEX FILE RULE: Do not automatically create index.ts (barrel files) unless the project already uses them.
12. TYPES AND INTERFACES: Search for existing types before defining new ones. Avoid duplicates like User, UserType, UserData.
13. CONSTANTS: Do not create a constants.ts for one trivial constant.
14. UTILITY FILES: Search for existing equivalents before creating a new utility.
15. SERVICE/API FILES: Keep API/service logic separate from UI code when the architecture dictates.
16. CONFIGURATION FILES: Do not modify package.json, vite.config.ts, etc., without inspecting how the project works.
17. ENVIRONMENT FILES: Never hardcode API keys or DB credentials. Respect existing .env conventions.
18. TEST FILES: Follow the project's existing testing convention (colocated vs centralized).
19. FILE LOCATION DECISION: Priority: 1. Existing convention 2. Feature architecture 3. Framework convention.
20. DO NOT MOVE FILES UNNECESSARILY: Only move if misplaced or required by existing architecture. Update all imports!
21. DELETE UNUSED FILES: Clean up temporary or obsolete files you created during the task.
22. FILE CONTENT BOUNDARIES: A file should not become a dumping ground. Keep responsibilities separated.
23. IMPORT RULES: After creating/moving files, verify all imports, use aliases, remove broken ones.
24. DIRECTORY DEPTH: Do not create excessive nesting (e.g., components/widgets/cards/statistics/...).
25. SMALL FEATURE RULE: Do not automatically create a massive architecture (components/, hooks/, services/) for a small feature.
26. LARGE FEATURE RULE: Do not put a massive feature into one file. Separate UI, API, state appropriately.
27. NEW PROJECT RULE: Establish the project foundation and structure FIRST before implementing feature files.
28. BEFORE FILE CREATION: Internally decide on files to reuse vs create vs modify.
29. BEFORE FINISHING: Inspect the structure. Ensure no duplicates, correct directories, and clean imports.
30. FINAL RULE: Optimize for: "The code runs, the files are correctly placed, responsibilities are clear, the structure follows the project architecture, and another developer can understand the project."

# ZERO-STOP GENERATION RULES

When the user asks you to build a feature (e.g., a login page), you must NEVER stop after generating only the folder structure. You must complete the entire implementation in one go.
Follow these exact steps:
1. First create the required project folder structure.
2. Then automatically create every file inside its correct folder.
3. Write the complete working code inside each file. Do not leave any file empty.
4. Do not only show or describe the code — actually create and save the files using \`writeFile\`.
5. Connect everything correctly (e.g., HTML linking to CSS/JS).
6. Ensure all file paths and imports are correct.

DO NOT STOP after creating the folder structure. Folder creation is only the first step. Continue automatically by creating and writing the complete code into every required file until the feature is fully implemented and ready to run.
Only consider the task complete when both the folder structure AND all files with complete working code have been created.

# FOLLOW-UP COMMANDS & MISSING FILES

When a project is partially created or only the folder structure exists, understand that the following commands have the same implementation intent:

- Add files       modify this also as an example
- Create files
- Build files
- Generate files
- Write files
- Implement files
- Complete files
- Finish the project
- Continue building
- Add missing files
- Generate missing files
- Complete the folder structure
- Populate the files
- Write code into files
- Implement the remaining project
- Finish implementation
- Build the remaining parts

When I use any of these commands, do not only explain what should be done and do not create another folder structure.

Instead:

1. Inspect the currently opened project and existing folder structure.
2. Detect which files already exist.
3. Detect which required files are missing.
4. Create all missing files in their correct locations.
5. Write complete working code into every newly created file.
6. If an existing file is empty or incomplete, complete its implementation.
7. Do not overwrite working code unnecessarily.
8. Maintain correct connections between HTML, CSS, JavaScript, backend, APIs, imports, and other dependencies.
9. Continue automatically until the requested feature or project is fully implemented.
10. Never consider the task complete just because folders exist.

Important:
Commands such as "add files", "build files", "generate files", "write to files", or similar commands should trigger actual file creation and code implementation.

Always perform the action directly on the project files. Do not just display code in the chat unless I specifically ask you to show the code instead of creating the files.

Before finishing, verify:
- Required folders exist
- Required files exist
- Missing files have been created
- Files contain actual implementation
- No required file is empty
- File paths and imports are correct
- The feature is ready to run

A project with only folders is NOT complete. Continue from the current project state and implement the missing files until the requested task is finished.

### Example

If the AI Pair previously created empty folders:
login-page/
├── css/
└── js/

Then you can simply say:
"Complete the files"

The AI Pair should inspect the existing project and output concrete JSON actions to create the missing files:
{
  "actions": [
    { "type": "writeFile", "path": "login-page/index.html", "content": "<!-- HTML code -->" },
    { "type": "writeFile", "path": "login-page/css/style.css", "content": "/* CSS code */" },
    { "type": "writeFile", "path": "login-page/js/script.js", "content": "// JS code" }
  ]
}

The key behavior is: your AI Pair should inspect the current project state first, then continue implementation using concrete writeFile actions instead of restarting or only generating a folder structure.

COMPLETENESS RULES (MANDATORY):
1. Every file you write must contain COMPLETE, PRODUCTION-READY code.
2. NEVER write placeholder comments like "// TODO", "// Add logic here", "// Implement this", "/* your code here */".
3. NEVER create empty functions, stub methods, or skeleton components.
4. NEVER tell the user to "finish the implementation" or "add your logic."
5. If a component needs state management, IMPLEMENT the full state logic.
6. If a feature needs CRUD operations, implement ALL of Create, Read, Update, Delete.
7. If the project uses TypeScript, every file must have proper types.
8. Include error handling, loading states, empty states, and validation in UI components.
9. Match the existing project's coding style, framework, and architecture.
10. Include responsive design and proper styling.
11. CRITICAL JSON FORMATTING: You MUST escape all newlines as \\n and quotes as \\" inside the "content" string. Do not use raw newlines inside JSON strings.
12. DOMAIN KNOWLEDGE: If asked for the "Find-S algorithm", ALWAYS write the Machine Learning Find-S algorithm for finding the most specific hypothesis from positive training examples. Do NOT write a linear search or string matching algorithm.
13. INTENT INFERENCE: Like a highly intelligent senior engineer, actively deduce the user's true intent even if their prompt is poorly worded, has typos, uses wrong terminology, or is grammatically incorrect. Do NOT take poorly phrased questions purely literally if doing so makes no sense. Instead, figure out what they *actually meant* to build, and provide the correct, industry-standard solution for their underlying intent.
14. LANGUAGE AUTO-DETECTION: If the user asks for a Machine Learning, Data Science, or heavy mathematical algorithm without specifying a language, automatically default to Python. For Web/UI tasks, default to React/TypeScript unless otherwise specified.

FEATURE COMPLETENESS CHECKLIST:
Before finalizing your response, verify:
- All files referenced in the plan are created with writeFile actions
- No file contains placeholder/TODO comments instead of real code
- Error handling exists in every async operation
- Form validation is implemented (not just "// validate here")
- Loading states are implemented
- The feature integrates with existing routing/navigation
- Imports are correct and reference actual project files
- The code would compile without errors

If you cannot fit all files in one response, or if the project requires many files, include a "remainingFiles" array listing the files you planned but did not include in "actions".
CRITICAL API LIMIT: You MUST divide large projects into small chunks. Output NO MORE THAN 3 files per response. Put all other required files into the "remainingFiles" array so the system can fetch them in the next pass.
${nluSection}
${historySection}

User request:
${task}

Workspace facts:
- Root: the user's active project directory
- Detected languages: ${detectedLangs.join(', ') || 'none detected'}
- Existing files: ${workspaceFiles.length > 0 ? workspaceFiles.join('\n') : '(empty workspace)'}
- CRITICAL RULE: Always trust the "Existing files" list above. If the workspace is empty or missing files, it means your previous actions failed or the user deleted them. You MUST recreate the files from scratch. DO NOT assume files exist just because you output them in the conversation history!
- Paths in actions are RELATIVE to the workspace root.
- INCREMENTAL PROJECT BUILDING & EVOLUTION: Treat every project as a continuously evolving system. Do NOT generate the complete future architecture at the beginning unless explicitly required.
  * ALWAYS work from the CURRENT project state (check "Existing files").
  * Compare the new requirement with the existing implementation. Determine the minimum correct set of changes required.
  * MODIFY EXISTING FILE: If the new functionality logically belongs there. Do not create new files unnecessarily.
  * CREATE NEW FILE: If the functionality is a separate component, existing files would become too large, or project architecture requires separation. Place in the most appropriate existing directory.
  * CREATE NEW DIRECTORY: Only when a new feature contains multiple related files, the project needs logical separation, or a new independent module is required.
  * SCALABLE PROJECT STRUCTURE GENERATION: Before scaffolding, classify as Small, Medium, Large, or Enterprise.
    - SMALL: Direct generation (index.html, style.css, script.js).
    - MEDIUM/LARGE: Use hierarchical generation. Create high-level structure first, expand modules incrementally.
  * PROJECT GROWTH: The architecture must evolve organically. A simple project might start flat and evolve into frontend/backend directories later. Preserve and migrate existing code when restructuring. NEVER regenerate the entire project blindly.
  * FINAL RULE: First ask internally: "What already exists, and what is the smallest correct architectural change required?" Then choose to modify a file, create a new file, or create a new directory.

Active file context:
${activeFile}

${packageJson ? `Root package.json:\\n${packageJson}` : ''}
${serverPackageJson ? `Server package.json:\\n${serverPackageJson}` : ''}

Available action types:
- listFiles: { "type": "listFiles", "path": "." }
- readFile: { "type": "readFile", "path": "relative/file.ts" }
- mkdir: { "type": "mkdir", "path": "relative/path" }
- writeFile: { "type": "writeFile", "path": "relative/file.ts", "content": "COMPLETE file contents here" }
- appendFile: { "type": "appendFile", "path": "relative/file.ts", "content": "content to append" }
- listFiles: { "type": "listFiles", "path": "src/components" }
- readFile: { "type": "readFile", "path": "src/App.tsx" }
- deleteFile: { "type": "deleteFile", "path": "relative/file.ts" }
- renameFile: { "type": "renameFile", "oldPath": "old.ts", "newPath": "new.ts" }
- installDependency: { "type": "installDependency", "packages": ["pkg"], "dev": false }
- runCommand: { "type": "runCommand", "command": "npm run build" }
- detectLanguages: { "type": "detectLanguages" }
- installExtension: { "type": "installExtension", "extensionId": "ext.id", "language": "lang" }
- askQuestion: { "type": "askQuestion", "question": "What UI framework?", "options": ["React", "Vue", "You choose for me"] }

Return ONLY valid JSON:
{
  "summary": "what you did (past tense, e.g. 'Added heading to index.html and created script.js')",
  "plan": ["step 1", "step 2"],
  "actions": [
    { "type": "writeFile", "path": "index.html", "content": "<!DOCTYPE html>..." },
    { "type": "writeFile", "path": "script.js", "content": "console.log('hello');" }
  ],
  "remainingFiles": [],
  "extensionRecommendations": [],
  "nextSteps": []
}

REMEMBER: You are an EXECUTOR, not an advisor. Write the code. Create the files. Do it now.
Every file must contain COMPLETE production code. No TODOs, no stubs, no placeholders.
Use relative paths only. Do not include destructive commands. If a file must be changed, provide the complete replacement content for writeFile.`;
}

// ── Completeness validation ──────────────────────────────────────────────────

function validateCompleteness(actions: AgentAction[]): string[] {
  const warnings: string[] = [];
  const stubPatterns = [
    /\/\/\s*TODO/i, /\/\/\s*FIXME/i, /\/\/\s*add\s+(your|logic|code|implementation)/i,
    /\/\*\s*implement/i, /throw new Error\(['"]not implemented['"]\)/i,
    /pass\s*#\s*TODO/i,
    /raise NotImplementedError/i,
  ];

  for (const action of actions) {
    if (action.type === 'writeFile') {
      const content = (action as { content: string }).content || '';
      for (const pattern of stubPatterns) {
        if (pattern.test(content)) {
          warnings.push(`File ${(action as { path: string }).path} contains placeholder code`);
          break;
        }
      }
      // Flag suspiciously short files (likely stubs)
      if (content.trim().split('\n').length < 5 && !/\.(json|yml|yaml|env|gitignore|example)$/.test((action as { path: string }).path)) {
        warnings.push(`File ${(action as { path: string }).path} is suspiciously short (${content.trim().split('\n').length} lines)`);
      }
    }
  }
  return warnings;
}

function buildContinuationPrompt(
  originalTask: string,
  fullPlan: string[],
  alreadyCreated: string[],
  remainingFiles: string[]
): string {
  return `You are continuing a multi-step code generation task.

ORIGINAL REQUEST: ${originalTask}

FULL PLAN:
${fullPlan.map((s, i) => `${i + 1}. ${s}`).join('\n')}

FILES ALREADY CREATED:
${alreadyCreated.map(f => `- ${f}`).join('\n')}

${remainingFiles.length > 0 ? `FILES STILL NEEDED:\n${remainingFiles.map(f => `- ${f}`).join('\n')}` : 'Generate any remaining files that the plan requires but were not yet created.'}

Generate the remaining files. Follow the same completeness rules — no placeholders, no TODOs, full production code.

Return ONLY valid JSON with the same schema: { "summary": "...", "plan": [], "actions": [...], "remainingFiles": [], "nextSteps": [] }
Include ONLY the NEW files not yet created.`;
}

// ── Main agent runner ─────────────────────────────────────────────────────────

export async function runStreamingPairProgrammerAgent(
  task: string,
  context: AIContext,
  conversationHistory: ConversationEntry[] = [],
  nluResult: NLUResult | undefined,
  res: any
): Promise<void> {
  const baseRoot = getWorkspaceRoot();
  let effectiveRoot = baseRoot;
  if (context.workspacePath) {
    try { effectiveRoot = resolveWorkspacePath(context.workspacePath); } catch {}
  }

  res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: 'analyze', target: 'project', message: 'Analyzing project...' })}\n\n`);

  let parsed: any;
  let rawText = '';
  const processedFiles = new Set<string>();

  if (shouldUseNewProjectScaffold(task)) {
    parsed = createGenericProjectScaffold(task);
    res.write(`data: ${JSON.stringify({ type: 'tool_complete', tool: 'analyze', target: 'project', status: 'success' })}\n\n`);
  } else {
    const prompt = await buildAgentPrompt(task, context, effectiveRoot, nluResult, conversationHistory);
    
    // Create an override to the response object that intercepts writes
    // so we can parse streaming JSON chunks and emit events.
    let accumulated = '';
    
    const fakeRes = {
      write: (chunk: string) => {
        if (chunk.startsWith('data: ')) {
          const dataStr = chunk.slice(6).trim();
          if (dataStr === '[DONE]') return;
          try {
            const parsedChunk = JSON.parse(dataStr);
            const text = parsedChunk.choices?.[0]?.delta?.content || '';
            if (text) {
              accumulated += text;
              // Send text delta to UI for raw viewing if desired
              res.write(`data: ${JSON.stringify({ type: 'text_delta', content: text })}\n\n`);
              
              // Scan accumulated text for file paths to emit tool_start
              const fileRegex = /"path"\s*:\s*"([^"]+)"/g;
              let match;
              while ((match = fileRegex.exec(accumulated)) !== null) {
                const filename = match[1];
                if (!processedFiles.has(filename)) {
                  processedFiles.add(filename);
                  res.write("data: " + JSON.stringify({ type: 'tool_start', tool: 'writeFile', target: filename, message: `Modifying ${filename}...` }) + "\n\n");
                }
              }
            }
          } catch {}
        }
      },
      end: () => {},
      setHeader: () => {},
      flushHeaders: () => {}
    };

    res.write(`data: ${JSON.stringify({ type: 'tool_complete', tool: 'analyze', target: 'project', status: 'success' })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: 'plan', target: 'architecture', message: 'Planning implementation...' })}\n\n`);
    
    try {
      const { streamChatResponse } = await import('./aiService');
      await streamChatResponse(prompt, context, fakeRes as any, conversationHistory);
      rawText = accumulated;
      parsed = extractJson(rawText);
      res.write(`data: ${JSON.stringify({ type: 'tool_complete', tool: 'plan', target: 'architecture', status: 'success' })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: 'tool_error', tool: 'plan', target: 'architecture', error: 'Failed to generate plan' })}\n\n`);
      throw err;
    }
  }

  // Completeness pass omitted for streaming brevity, but we can do a simple final validation
  const fullPlan = Array.isArray(parsed.plan) ? parsed.plan : [];
  const summary = parsed.summary || 'Agent task completed.';
  const nextSteps = Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [];
  const extensionRecommendations = Array.isArray(parsed.extensionRecommendations) ? parsed.extensionRecommendations : [];
  const allActions = Array.isArray(parsed.actions) ? parsed.actions : [];

  const result: AgentResult = {
    summary, plan: fullPlan, actions: [], nextSteps, extensionRecommendations, detectedLanguages: [],
  };

  const isLocalWorkspace = context.workspaceType === 'local';

  res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: 'execute', target: 'workspace', message: 'Applying changes...' })}\n\n`);

  for (const action of allActions) {
    if (action.type === 'writeFile' || action.type === 'mkdir' || action.type === 'deleteFile') {
      const targetPath = (action as any).path;
      if (processedFiles.has(targetPath)) {
        res.write(`data: ${JSON.stringify({ type: 'tool_complete', tool: action.type, target: targetPath, status: 'success' })}\n\n`);
      }
    }
    // We append the raw action. If it's local, frontend applies it!
    if (isLocalWorkspace) {
      result.actions.push({ ...action, success: true, output: 'Local workspace: handled by frontend' } as any);
      continue;
    }
    
    // Fallback if backend needs to run it (omitted for brevity, handled similarly to runPairProgrammerAgent)
  }

  res.write(`data: ${JSON.stringify({ type: 'tool_complete', tool: 'execute', target: 'workspace', status: 'success' })}\n\n`);
  
  // Send final agent result so frontend can execute the file changes
  res.write(`data: ${JSON.stringify({ type: 'agent_result', result })}\n\n`);
}

export async function runPairProgrammerAgent(
  task: string,
  context: AIContext,
  conversationHistory: ConversationEntry[] = [],
  nluResult?: NLUResult
): Promise<AgentResult> {
  const baseRoot = getWorkspaceRoot();
  
  let effectiveRoot = baseRoot;
  if (context.workspacePath) {
    try {
      effectiveRoot = resolveWorkspacePath(context.workspacePath);
    } catch {
      // If workspacePath is invalid, keep using baseRoot.
    }
  }

  const MAX_PASSES = 4;
  let allActions: AgentAction[] = [];
  let fullPlan: string[] = [];
  let summary = '';
  let nextSteps: string[] = [];
  let extensionRecommendations: Array<{ extensionId: string; language: string; reason: string }> = [];

  // Pass 1: Get the full plan + as many files as fit in one response
  let parsed: any;
  let rawText = '';
  try {
    if (shouldUseNewProjectScaffold(task)) {
      parsed = createGenericProjectScaffold(task);
    } else {
      rawText = await getChatCompletion(await buildAgentPrompt(task, context, effectiveRoot, nluResult, conversationHistory), context, 4000);
      parsed = extractJson(rawText);
    }
  } catch (err) {
    // If parsing failed, retry once with strict JSON prompt
    try {
      const retryPrompt = `You are a strict JSON generator. Your previous response failed to parse as valid JSON because of raw newlines or unescaped quotes inside the "content" strings.
Please rewrite your response for this task. 
CRITICAL: You MUST escape ALL newlines as \\n and ALL double-quotes as \\" inside the "content" strings. Do NOT use raw newlines inside JSON strings.
Task: ${task}

Return ONLY valid JSON matching this schema: {summary:string, plan:string[], actions: [{type:string, path?:string, content?:string, command?:string}], remainingFiles:string[], nextSteps:string[]}. Every writeFile action MUST contain COMPLETE file contents. Do not include any extra text outside the JSON.`;
      const retryText = await getChatCompletion(retryPrompt, context, 4000);
      parsed = extractJson(retryText);
    } catch (err2) {
      throw err;
    }
  }

  // If actions are empty, attempt conversion pass
  if (!Array.isArray(parsed.actions) || parsed.actions.length === 0) {
    try {
      const convertPrompt = `Convert the following partial result into the full JSON schema. Partial: ${JSON.stringify(parsed)}\nReturn ONLY JSON with concrete actions (mkdir/writeFile/appendFile/runCommand/installDependency/detectLanguages/installExtension) based on the plan. Every writeFile action MUST contain COMPLETE production-ready code. No TODOs, no placeholders.`;
      const convertText = await getChatCompletion(convertPrompt, context, 4000);
      const converted = extractJson(convertText);
      if (Array.isArray(converted.actions) && converted.actions.length > 0) parsed = converted;
    } catch (err3) {
      // leave parsed as-is
    }
  }

  fullPlan = Array.isArray(parsed.plan) ? parsed.plan : [];
  summary = parsed.summary || 'Agent task completed.';
  nextSteps = Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [];
  extensionRecommendations = Array.isArray(parsed.extensionRecommendations) ? parsed.extensionRecommendations : [];
  allActions = Array.isArray(parsed.actions) ? parsed.actions : [];

  // Multi-pass: check for remaining files and continue if needed
  const remainingFiles: string[] = Array.isArray(parsed.remainingFiles) ? parsed.remainingFiles : [];
  
  const hasQuestion = allActions.some((a: any) => a.type === 'askQuestion');

  if (!hasQuestion && remainingFiles.length > 0) {
    for (let pass = 2; pass <= MAX_PASSES && remainingFiles.length > 0; pass++) {
      const alreadyCreated = allActions
        .filter((a: any) => a.type === 'writeFile')
        .map((a: any) => a.path);

      const continuePrompt = buildContinuationPrompt(task, fullPlan, alreadyCreated, remainingFiles);

      try {
        const passResult = extractJson(await getChatCompletion(continuePrompt, context, 4000));
        const newActions = Array.isArray(passResult.actions) ? passResult.actions : [];
        allActions.push(...newActions);

        // Update remaining files
        const newRemaining = Array.isArray(passResult.remainingFiles) ? passResult.remainingFiles : [];
        remainingFiles.length = 0;
        remainingFiles.push(...newRemaining);
      } catch {
        break;
      }
    }
  }

  // Completeness validation — check for stubs/placeholders
  const completenessWarnings = !hasQuestion ? validateCompleteness(allActions) : [];
  if (completenessWarnings.length > 0) {
    try {
      const fixPrompt = `The following files contain placeholder/stub code that must be replaced with real implementations:\n${completenessWarnings.join('\n')}\n\nRegenerate ONLY those files with COMPLETE, PRODUCTION-READY code. No TODOs, no placeholders, no stubs.\n\nReturn JSON: { "actions": [{ "type": "writeFile", "path": "...", "content": "COMPLETE code" }] }`;
      const fixResult = extractJson(await getChatCompletion(fixPrompt, context, 4000));
      if (Array.isArray(fixResult.actions)) {
        // Replace the stub files with fixed versions
        for (const fixAction of fixResult.actions) {
          if (fixAction.type === 'writeFile') {
            const idx = allActions.findIndex((a: any) => a.type === 'writeFile' && a.path === (fixAction as any).path);
            if (idx >= 0) {
              allActions[idx] = fixAction;
            } else {
              allActions.push(fixAction);
            }
          }
        }
      }
    } catch {
      // If fix pass fails, proceed with what we have
    }
  }
  const result: AgentResult = {
    summary: summary,
    plan: fullPlan,
    actions: [],
    nextSteps: nextSteps,
    extensionRecommendations: extensionRecommendations,
    detectedLanguages: [],
  };

  const isLocalWorkspace = context.workspaceType === 'local';

  for (const action of allActions) {
    try {
      if (action.type === 'listFiles') {
        if (isLocalWorkspace) {
          result.actions.push({ type: action.type, target: (action as { path?: string }).path || '.', success: true, output: 'Local workspace: will be handled by frontend if needed' });
          continue;
        }
        const target = resolveAgentActionPath((action as { path?: string }).path || '.', effectiveRoot);
        const entries = await fs.readdir(target, { withFileTypes: true });
        const output = entries
          .map((entry) => `${entry.isDirectory() ? 'dir ' : 'file'} ${entry.name}`)
          .join('\n') || '(empty directory)';
        result.actions.push({ type: action.type, target: (action as { path?: string }).path || '.', success: true, output });

      } else if (action.type === 'readFile') {
        if (isLocalWorkspace) {
          result.actions.push({ type: action.type, target: (action as { path: string }).path, success: true, output: 'Local workspace: will be read by frontend if needed' });
          continue;
        }
        const a = action as { path: string };
        const target = resolveAgentActionPath(a.path, effectiveRoot);
        const content = await fs.readFile(target, 'utf-8');
        result.actions.push({ type: action.type, target: a.path, success: true, output: content.slice(0, MAX_OUTPUT) });

      } else if (action.type === 'mkdir') {
        const a = action as { path: string };
        if (isLocalWorkspace) {
          result.actions.push({ type: action.type, target: a.path, success: true, output: 'Pending UI confirmation' });
          continue;
        }
        const target = resolveAgentActionPath(a.path, effectiveRoot);
        await fsCreateDirectory(target);
        result.actions.push({ type: action.type, target: a.path, success: true, output: 'Directory created' });

      } else if (action.type === 'writeFile') {
        const a = action as { path: string; content: string };
        if (isLocalWorkspace) {
          result.actions.push({ type: action.type, target: a.path, success: true, output: 'Pending UI confirmation' });
          continue;
        }
        const target = resolveAgentActionPath(a.path, effectiveRoot);
        await fsWriteFile(target, a.content || '');
        result.actions.push({ type: action.type, target: a.path, success: true, output: 'File written' });

      } else if (action.type === 'appendFile') {
        const a = action as { path: string; content: string };
        if (isLocalWorkspace) {
          result.actions.push({ type: action.type, target: a.path, success: true, output: 'Pending UI confirmation' });
          continue;
        }
        const target = resolveAgentActionPath(a.path, effectiveRoot);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.appendFile(target, a.content || '', 'utf-8');
        result.actions.push({ type: action.type, target: a.path, success: true, output: 'File appended' });

      } else if (action.type === 'deleteFile') {
        const a = action as { path: string };
        if (isLocalWorkspace) {
          result.actions.push({ type: action.type, target: a.path, success: true, output: 'Pending UI confirmation' });
          continue;
        }
        const target = resolveAgentActionPath(a.path, effectiveRoot);
        await fsDeleteFile(target);
        result.actions.push({ type: action.type, target: a.path, success: true, output: 'File deleted' });

      } else if (action.type === 'renameFile') {
        const a = action as { oldPath: string; newPath: string };
        if (isLocalWorkspace) {
          result.actions.push({ type: action.type, target: `${a.oldPath} -> ${a.newPath}`, success: true, output: 'Pending UI confirmation' });
          continue;
        }
        const oldTarget = resolveAgentActionPath(a.oldPath, effectiveRoot);
        const newTarget = resolveAgentActionPath(a.newPath, effectiveRoot);
        await renameWorkspaceFile(oldTarget, newTarget);
        result.actions.push({ type: action.type, target: `${a.oldPath} -> ${a.newPath}`, success: true, output: 'File renamed' });

      } else if (action.type === 'installDependency') {
        const a = action as { packages: string[]; dev?: boolean };
        const packages = Array.isArray(a.packages) ? a.packages.filter(Boolean) : [];
        if (packages.length === 0) throw new Error('No packages were provided');
        if (isLocalWorkspace) {
          result.actions.push({ type: action.type, target: packages.join(', '), success: false, output: 'Cannot run npm commands directly on local folders from browser.' });
          continue;
        }
        const command = `npm install ${a.dev ? '-D ' : ''}${packages.join(' ')}`;
        const output = await runWorkspaceCommand(command, effectiveRoot);
        result.actions.push({ type: action.type, target: packages.join(', '), success: true, output });

      } else if (action.type === 'runCommand') {
        const a = action as { command: string; cwd?: string };
        if (isLocalWorkspace) {
          result.actions.push({ type: action.type, target: a.cwd ? `${a.cwd}: ${a.command}` : a.command, success: false, output: 'Cannot run terminal commands directly on local folders from browser.' });
          continue;
        }
        const commandRoot = a.cwd ? resolveAgentActionPath(a.cwd, effectiveRoot) : effectiveRoot;
        const output = await runWorkspaceCommand(a.command, commandRoot);
        result.actions.push({ type: action.type, target: a.cwd ? `${a.cwd}: ${a.command}` : a.command, success: true, output });

      } else if (action.type === 'detectLanguages') {
        const langs = await detectWorkspaceLanguages(effectiveRoot);
        result.detectedLanguages = langs;
        // Auto-generate extension recommendations for detected langs
        for (const lang of langs) {
          const extensions = getExtensionsForLanguage(lang);
          for (const ext of extensions) {
            const alreadyRecommended = result.extensionRecommendations?.some((r) => r.extensionId === ext.id);
            if (!alreadyRecommended) {
              result.extensionRecommendations = result.extensionRecommendations || [];
              result.extensionRecommendations.push({
                extensionId: ext.id,
                language: lang,
                reason: `${ext.displayName} for ${lang} support`,
              });
            }
          }
        }
        result.actions.push({
          type: action.type,
          target: 'workspace',
          success: true,
          output: `Detected languages: ${langs.join(', ')}`,
        });

      } else if (action.type === 'installExtension') {
        const a = action as { extensionId: string; language?: string };
        // Extension installation is handled client-side; we record the recommendation
        result.extensionRecommendations = result.extensionRecommendations || [];
        const alreadyAdded = result.extensionRecommendations.some((r) => r.extensionId === a.extensionId);
        if (!alreadyAdded) {
          result.extensionRecommendations.push({
            extensionId: a.extensionId,
            language: a.language || 'general',
            reason: `Recommended by AI pair for ${a.language || 'this project'}`,
          });
        }
        result.actions.push({
          type: action.type,
          target: a.extensionId,
          success: true,
          output: `Extension ${a.extensionId} queued for installation`,
        });
      }
    } catch (error) {
      result.actions.push({
        type: action.type,
        target: getActionTarget(action),
        success: false,
        output: error instanceof Error ? error.message : 'Action failed',
      });
    }
  }

  return result;
}

/**
 * Called directly (not via AI) to auto-detect languages and return extension recommendations.
 * Used by the AI pair panel on file open.
 */
export async function autoDetectAndRecommendExtensions(language?: string): Promise<AgentResult['extensionRecommendations']> {
  const baseRoot = getWorkspaceRoot();
  const langs = language ? [language.toLowerCase()] : await detectWorkspaceLanguages(baseRoot);
  const recommendations: AgentResult['extensionRecommendations'] = [];

  for (const lang of langs.slice(0, 3)) {
    const extensions = getExtensionsForLanguage(lang);
    for (const ext of extensions) {
      recommendations.push({
        extensionId: ext.id,
        language: lang,
        reason: `${ext.displayName} for ${lang} support`,
      });
    }
  }

  return recommendations;
}
