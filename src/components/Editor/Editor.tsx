import LanguageServicesEditor from './LanguageServicesEditor';
import { useCallback } from 'react';
import EditorTabs from './EditorTabs';
import Breadcrumbs from './Breadcrumbs';
import MonacoEditor from './MonacoEditor';
import ThunderRequestEditor from './ThunderRequestEditor';
import ExtensionDetailEditor from './ExtensionDetailEditor';
import SettingsEditor from './SettingsEditor';
import HtmlPreview from './HtmlPreview';
import { useEditorStore } from '../../store/editorStore';
import { useFileStore } from '../../store/fileStore';
import { useUIStore } from '../../store/uiStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { fileService } from '../../services/fileService';
import { workspaceService } from '../../services/workspaceService';
import { FileNode } from '../../types/file.types';
import {
  Bot,
  Check,
  Code2,
  FilePlus2,
  FolderOpen,
  GitBranch,
  Lightbulb,
  MessageSquarePlus,
  Network,
  Star,
  X,
  LayoutTemplate,
  Sparkles,
} from 'lucide-react';

type StartActionId = 'new-file' | 'open-file' | 'open-folder' | 'clone' | 'connect' | 'generate-workspace';

const startItems: Array<{ id: StartActionId; label: string; icon: typeof FilePlus2 }> = [
  { id: 'new-file', label: 'New File...', icon: FilePlus2 },
  { id: 'open-file', label: 'Open File...', icon: FilePlus2 },
  { id: 'open-folder', label: 'Open Folder...', icon: FolderOpen },
  { id: 'clone', label: 'Clone Git Repository...', icon: GitBranch },
  { id: 'connect', label: 'Connect to...', icon: Code2 },
  { id: 'generate-workspace', label: 'Generate New Workspace...', icon: MessageSquarePlus },
];

const recentItems = [
  ['AI-Web-IDE', 'E:\\'],
  ['class 76', 'E:\\web development'],
  ['class 75', 'E:\\web development'],
  ['web development', 'E:\\'],
  ['Task Managemen', 'C:\\'],
];

const walkthroughs = [
  {
    title: 'Get started with VS Code',
    description: 'Customize your editor, learn the basics, and start coding',
    icon: Star,
    featured: true,
  },
  { title: 'Learn the Fundamentals', icon: Lightbulb, progress: 0.2 },
  { title: 'GitHub Copilot', icon: Bot, badge: 'Updated', progress: 0.4 },
  { title: 'Get started with Claude Code', icon: Star, badge: 'Updated', progress: 0 },
  { title: 'Get Started With GitLens', icon: Network, badge: 'Updated', progress: 0.4 },
];

export default function Editor() {
  const { tabs, activeTabId, getActiveTab, updateTabContent, splitConfig } = useEditorStore();
  const activeTab = getActiveTab();

  const handleContentChange = useCallback((content: string) => {
    if (activeTabId) {
      updateTabContent(activeTabId, content);
    }
  }, [activeTabId, updateTabContent]);

  const renderActiveEditor = () => {
    if (activeTab?.language === 'thunder-request') {
      return <ThunderRequestEditor tabId={activeTab.id} content={activeTab.content} />;
    }

    if (activeTab?.language === 'extension-detail') {
      return <ExtensionDetailEditor content={activeTab.content} />;
    }

    
    if (activeTab?.language === 'ide-settings') {
      return <SettingsEditor />;
    }

    if (activeTab?.language === 'language-services') {
      return <LanguageServicesEditor />;
    }


    if (activeTab) {
      return (
        <MonacoEditor
          tabId={activeTab.id}
          filePath={activeTab.filePath}
          content={activeTab.content}
          language={activeTab.language}
          onContentChange={handleContentChange}
        />
      );
    }

    return <WelcomeEditor />;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--color-background)' }}>
      <EditorTabs />
      {activeTab && !['thunder-request', 'extension-detail', 'ide-settings', 'language-services'].includes(activeTab.language) && <Breadcrumbs />}
      <div className="flex-1 overflow-hidden">
        {splitConfig.enabled ? (
          <div className={splitConfig.direction === 'vertical' ? 'flex h-full' : 'flex h-full flex-col'}>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              {renderActiveEditor()}
            </div>
              <div
              className="min-h-0 min-w-0 flex-1 overflow-hidden border"
              style={{
                borderColor: 'var(--color-border)',
                borderTopWidth: splitConfig.direction === 'horizontal' ? 1 : 0,
                borderLeftWidth: splitConfig.direction === 'vertical' ? 1 : 0,
              }}
            >
              {activeTab?.language === 'html' ? (
                <HtmlPreview content={activeTab.content} filePath={activeTab.filePath} tabs={tabs} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-[13px] bg-[var(--color-sidebar)]" style={{ color: 'var(--color-textFaint)' }}>
                  <LayoutTemplate size={48} className="mb-4 opacity-20" />
                  <span>Live Preview is only available for HTML files</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          renderActiveEditor()
        )}
      </div>
    </div>
  );
}

function WelcomeEditor() {
  const openTab = useEditorStore((state) => state.openTab);
  const closeAllTabs = useEditorStore((state) => state.closeAllTabs);
  const setFileTree = useFileStore((state) => state.setFileTree);
  const addFile = useFileStore((state) => state.addFile);
  const setWorkspace = useWorkspaceStore((state) => state.setWorkspace);
  const { addNotification, setRightPanelVisible, setBottomPanelVisible, setActiveBottomPanel } = useUIStore();

  const notify = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    addNotification({ type, message });
  };

  const createUntitledFile = () => {
    const timestamp = Date.now();
    openTab({
      id: `tab-untitled-${timestamp}`,
      fileId: `untitled-${timestamp}`,
      filePath: '/untitled/Untitled-1',
      fileName: 'Untitled-1',
      language: 'plaintext',
      content: '',
      isDirty: true,
      isPreview: false,
      cursorPosition: { line: 1, column: 1 },
    });
    notify('New text file created', 'success');
  };

  const createNamedFile = () => {
    const fileName = window.prompt('File name', 'new-file.ts')?.trim();
    if (!fileName) return;

    const language = fileService.getLanguageFromExtension(fileName);
    const path = `/workspace/${fileName}`;
    const node: FileNode = {
      id: `welcome-file-${Date.now()}`,
      name: fileName,
      path,
      type: 'file',
      extension: fileName.split('.').pop(),
      language,
      lastModified: Date.now(),
    };
    addFile(node);
    openTab({
      id: `tab-${node.id}`,
      fileId: node.id,
      filePath: path,
      fileName,
      language,
      content: getDefaultContent(fileName, language),
      isDirty: true,
      isPreview: false,
      cursorPosition: { line: 1, column: 1 },
    });
    notify(`${fileName} created`, 'success');
  };

  const cloneRepository = () => {
    const repositoryUrl = window.prompt('Repository URL to clone');
    if (!repositoryUrl?.trim()) return;
    const cleanUrl = repositoryUrl.trim();
    const repoName = cleanUrl.split('/').pop()?.replace(/\.git$/, '') || 'cloned-repository';
    window.dispatchEvent(new CustomEvent('ai-web-ide:create-cloned-workspace', {
      detail: { repositoryUrl: cleanUrl, repoName },
    }));
  };

  const createGeneratedWorkspace = async () => {
    const projectName = window.prompt('Workspace name', 'generated-workspace')?.trim() || 'generated-workspace';
    if (!projectName) return;
    try {
      const workspace = await workspaceService.createWorkspace(projectName);
      const tree = await fileService.getFileTree(workspace.path);
      closeAllTabs();
      setWorkspace(workspace);
      setFileTree(tree);
      
      const srcNode = tree.find(n => n.name === 'src');
      const indexNode = srcNode?.children?.find(n => n.name === 'index.ts');
      const appPath = indexNode ? indexNode.path : `${workspace.path}/src/index.ts`;
      
      openTab({
        id: `tab-generated-app-${Date.now()}`,
        fileId: indexNode ? indexNode.id : `generated-app-${Date.now()}`,
        filePath: appPath,
        fileName: 'index.ts',
        language: 'typescript',
        content: `// ${projectName} - main entry point\n\nconsole.log('Hello from ${projectName}!');\n`,
        isDirty: false,
        isPreview: false,
        cursorPosition: { line: 1, column: 1 },
      });
      notify(`${projectName} workspace created and saved to local computer`, 'success');
    } catch (error) {
      notify(`Failed to create workspace: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const openRecent = (name: string, path: string) => {
    const readmePath = `${path.replace(/\\$/, '')}/${name}/README.md`.replace(/\\/g, '/');
    const workspacePath = readmePath.replace('/README.md', '');
    const tree = buildRecentWorkspaceTree(name, workspacePath);
    closeAllTabs();
    setWorkspace(createWorkspaceDescriptor(name, workspacePath));
    setFileTree(tree);
    openTab({
      id: `tab-recent-${Date.now()}`,
      fileId: tree[0].children?.[0].id || `recent-readme-${Date.now()}`,
      filePath: readmePath,
      fileName: 'README.md',
      language: 'markdown',
      content: `# ${name}\n\nRecent workspace opened from ${path}.\n`,
      isDirty: false,
      isPreview: false,
      cursorPosition: { line: 1, column: 1 },
    });
    notify(`Opened ${name}`, 'success');
  };

  const openWalkthrough = (title: string, description?: string) => {
    const content = `# ${title}\n\n${description || 'Use the editor, explorer, terminal, source control, extensions, and AI tools from this workspace.'}\n\n- Create or open files from the Start area.\n- Edit code in Monaco with IntelliSense, find, replace, formatting, minimap, folding, and multi-cursor commands.\n- Use the command palette for workspace commands.\n`;
    openTab({
      id: `tab-walkthrough-${Date.now()}`,
      fileId: `walkthrough-${Date.now()}`,
      filePath: `/walkthroughs/${title}.md`,
      fileName: `${title}.md`,
      language: 'markdown',
      content,
      isDirty: false,
      isPreview: false,
      cursorPosition: { line: 1, column: 1 },
    });
  };

  const runStartAction = (id: StartActionId) => {
    if (id === 'new-file') createNamedFile();
    if (id === 'open-file') window.dispatchEvent(new CustomEvent('ai-web-ide:open-file'));
    if (id === 'open-folder') window.dispatchEvent(new CustomEvent('ai-web-ide:open-folder', { detail: { mode: 'open' } }));
    if (id === 'clone') cloneRepository();
    if (id === 'connect') {
      setBottomPanelVisible(true);
      setActiveBottomPanel('terminal');
      notify('Terminal connection opened', 'success');
    }
    if (id === 'generate-workspace') createGeneratedWorkspace();
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-[var(--color-background)] text-[var(--color-text)] select-none">
      <div className="flex flex-col items-center mb-12">
        <AppLogo className="mb-4 h-16 w-16 text-[var(--accent)] drop-shadow-md" />
        <h1 className="text-3xl font-semibold tracking-tight mb-2">AI WEB IDE</h1>
        <p className="text-[var(--color-textFaint)] text-lg tracking-wide">Build. Code. Create. Faster.</p>
      </div>

      <div className="flex gap-6 mb-16">
        <button
          onClick={() => runStartAction('open-folder')}
          className="flex flex-col items-center justify-center gap-3 w-40 h-32 rounded-xl bg-[var(--color-sidebar)] border border-[var(--color-border)] hover:border-[var(--accent)] hover:bg-[var(--glass-bg)] transition-all cursor-pointer group shadow-sm hover:shadow-[var(--accent-glow)]"
        >
          <FolderOpen size={32} className="text-[var(--color-textMuted)] group-hover:text-[var(--accent)] transition-colors" />
          <span className="font-medium">Open Project</span>
        </button>

        <button
          onClick={() => runStartAction('generate-workspace')}
          className="flex flex-col items-center justify-center gap-3 w-40 h-32 rounded-xl bg-[var(--color-sidebar)] border border-[var(--color-border)] hover:border-[var(--accent)] hover:bg-[var(--glass-bg)] transition-all cursor-pointer group shadow-sm hover:shadow-[var(--accent-glow)]"
        >
          <Sparkles size={32} className="text-[var(--color-textMuted)] group-hover:text-[var(--accent)] transition-colors" />
          <span className="font-medium">New Project</span>
        </button>
      </div>

      <div className="flex flex-col items-center w-full max-w-md">
        <h2 className="text-sm font-semibold text-[var(--color-textMuted)] uppercase tracking-wider mb-4">Recent Projects</h2>
        <div className="flex flex-col w-full gap-2">
          {recentItems.length > 0 ? (
            recentItems.map(([name, path]) => (
              <button
                key={`${name}-${path}`}
                onClick={() => openRecent(name, path)}
                className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-[var(--color-hover)] transition-colors text-left group"
              >
                <span className="font-medium group-hover:text-[var(--accent)] transition-colors">{name}</span>
                <span className="text-xs text-[var(--color-textFaint)] truncate max-w-[200px]">{path}</span>
              </button>
            ))
          ) : (
            <div className="text-center py-4 text-[var(--color-textFaint)] text-sm italic">
              No recent projects found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AppLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="url(#logo-gradient)"
        d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
        stroke="url(#logo-gradient)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="logo-gradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function WalkthroughCard({
  title,
  description,
  icon: Icon,
  badge,
  featured,
  progress = 0,
  onClick,
}: {
  title: string;
  description?: string;
  icon: typeof Star;
  badge?: string;
  featured?: boolean;
  progress?: number;
  onClick?: () => void;
}) {
  return (
    <button
      className="relative flex min-h-[48px] w-full items-center overflow-hidden rounded-md text-left"
      style={{ background: '#2b2b2b', color: '#d8d8d8' }}
      onClick={onClick}
    >
      {featured && (
        <div className="absolute left-0 top-0 h-0 w-0 border-r-[58px] border-t-[40px]" style={{ borderRightColor: 'transparent', borderTopColor: '#56afe0' }}>
          <Star size={18} fill="#ffffff" className="absolute -left-[52px] -top-[36px] text-white" />
        </div>
      )}
      <div className="flex w-full items-center gap-4 px-3 py-3">
        {!featured && (
          <span className="flex h-[36px] w-[36px] flex-shrink-0 items-center justify-center rounded-full" style={{ color: '#56afe0' }}>
            <Icon size={29} strokeWidth={1.7} />
          </span>
        )}
        <div className={featured ? 'ml-9' : ''}>
          <div className="flex items-center gap-2 text-[20px] font-semibold leading-tight">
            <span>{title}</span>
            {badge && (
              <span className="rounded-md px-1.5 py-0.5 text-[16px] font-normal" style={{ background: '#35a6dd', color: '#ffffff' }}>
                {badge}
              </span>
            )}
          </div>
          {description && <div className="mt-2 text-[20px] font-normal leading-tight">{description}</div>}
        </div>
      </div>
      {progress > 0 && (
        <div className="absolute bottom-0 left-0 h-[5px]" style={{ width: `${progress * 100}%`, background: '#008ff0' }} />
      )}
    </button>
  );
}

function createWorkspaceDescriptor(name: string, path: string) {
  return {
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
    name,
    path,
    createdAt: Date.now(),
    lastOpenedAt: Date.now(),
    recentFiles: [],
    settings: {
      theme: 'dark',
      fontSize: 14,
      tabSize: 2,
      formatOnSave: true,
      aiEnabled: true,
      terminalShell: '/bin/bash',
    },
  };
}

function buildRecentWorkspaceTree(name: string, path: string): FileNode[] {
  return [{
    id: `recent-root-${Date.now()}`,
    name,
    path,
    type: 'directory',
    children: [{
      id: `recent-readme-${Date.now()}`,
      name: 'README.md',
      path: `${path}/README.md`,
      type: 'file',
      extension: 'md',
      language: 'markdown',
    }],
  }];
}

function buildGeneratedWorkspaceTree(projectName: string, basePath: string, appPath: string): FileNode[] {
  return [{
    id: `generated-root-${Date.now()}`,
    name: projectName,
    path: basePath,
    type: 'directory',
    children: [
      {
        id: `generated-package-${Date.now()}`,
        name: 'package.json',
        path: `${basePath}/package.json`,
        type: 'file',
        extension: 'json',
        language: 'json',
      },
      {
        id: `generated-src-${Date.now()}`,
        name: 'src',
        path: `${basePath}/src`,
        type: 'directory',
        children: [{
          id: `generated-app-${Date.now()}`,
          name: 'App.tsx',
          path: appPath,
          type: 'file',
          extension: 'tsx',
          language: 'typescript',
        }],
      },
    ],
  }];
}

function getDefaultContent(filename: string, language: string) {
  const defaults: Record<string, string> = {
    typescript: `// ${filename}\n\nexport {};\n`,
    javascript: `// ${filename}\n\n`,
    html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>\n',
    css: `/* ${filename} */\n\n`,
    json: '{\n  \n}\n',
    markdown: `# ${filename.replace('.md', '')}\n\n`,
    plaintext: '',
  };
  return defaults[language] || `// ${filename}\n`;
}
