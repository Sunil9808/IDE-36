import { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { ChevronRight, ChevronDown, Plus, FolderPlus, RefreshCw, ChevronsDownUp, Search, AlertTriangle, Loader2 } from 'lucide-react';
import { useFileStore } from '../../../store/fileStore';
import { useEditorStore } from '../../../store/editorStore';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { useUIStore } from '../../../store/uiStore';
import { FileNode } from '../../../types/file.types';
import { getLanguageFromExtension } from '../../../utils/fileHelpers';
import { fileService } from '../../../services/fileService';
import { browserFileCache } from '../../../services/browserFileCache';
import FileTypeIcon from '../../Icons/FileTypeIcon';

// Helpers
function filterTree(nodes: FileNode[], query: string): FileNode[] {
  if (!query) return nodes;
  const lowerQuery = query.toLowerCase();
  return nodes
    .map((node) => {
      if (node.type === 'directory') {
        const filteredChildren = filterTree(node.children || [], query);
        if (filteredChildren.length > 0 || node.name.toLowerCase().includes(lowerQuery)) {
          return { ...node, children: filteredChildren };
        }
        return null;
      }
      if (node.name.toLowerCase().includes(lowerQuery)) {
        return node;
      }
      return null;
    })
    .filter(Boolean) as FileNode[];
}

function getDefaultContent(filename: string, language: string): string {
  const defaults: Record<string, string> = {
    typescript: `// ${filename}\n\nexport {};\n`,
    javascript: `// ${filename}\n\n`,
    java: `public class ${filename.replace('.java', '')} {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n    }\n}\n`,
    python: `# ${filename}\n\n`,
    html: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>\n`,
    css: `/* ${filename} */\n\n`,
    json: `{\n  \n}\n`,
    markdown: `# ${filename.replace('.md', '')}\n\n`,
    plaintext: ``,
  };
  return defaults[language] || `// ${filename}\n`;
}

async function readNodeContent(node: FileNode, language: string) {
  const browserContent = await browserFileCache.read(node.path);
  if (browserContent !== null) return browserContent;

  try {
    const result = await fileService.readFile(node.path);
    return result.content;
  } catch {
    return getDefaultContent(node.name, language);
  }
}

export default function Explorer() {
  const { fileTree, expandedFolders, toggleFolder, collapseFolder, selectedFileId, selectFile, setFileTree } = useFileStore();
  const workspace = useWorkspaceStore((state) => state.workspace);
  const { openTab } = useEditorStore();
  const { addNotification, setActiveBottomPanel, setBottomPanelVisible } = useUIStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Inline edit state
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [creatingState, setCreatingState] = useState<{ parentPath: string; type: 'file' | 'directory' } | null>(null);

  const filteredTree = useMemo(() => filterTree(fileTree, searchQuery), [fileTree, searchQuery]);

  const refreshExplorer = useCallback(async (silent = false) => {
    if (!workspace?.path) return;
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const tree = await fileService.getFileTree(workspace.path);
      setFileTree(tree);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh Explorer';
      if (!silent) setError(msg);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [workspace?.path, setFileTree]);

  // Refresh automatically when workspace changes
  useEffect(() => {
    const handleWorkspaceChanged = () => void refreshExplorer();
    window.addEventListener('ai-web-ide:workspace-changed', handleWorkspaceChanged);
    window.addEventListener('ai-web-ide:refresh-explorer', handleWorkspaceChanged);
    if (workspace?.path) void refreshExplorer();

    let timeoutId: any;
    let isCancelled = false;
    const pollFileTree = async () => {
      if (isCancelled || workspace?.type !== 'local') return;
      await refreshExplorer(true);
      if (!isCancelled) timeoutId = setTimeout(pollFileTree, 3000);
    };
    if (workspace?.type === 'local') timeoutId = setTimeout(pollFileTree, 3000);
    
    return () => {
      isCancelled = true;
      window.removeEventListener('ai-web-ide:workspace-changed', handleWorkspaceChanged);
      window.removeEventListener('ai-web-ide:refresh-explorer', handleWorkspaceChanged);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [workspace?.path, workspace?.type, refreshExplorer]);

  const getSelectedNodeParentPath = useCallback(() => {
    if (!selectedFileId) return workspace?.path || '';
    
    let foundPath = workspace?.path || '';
    const findParent = (nodes: FileNode[], parentPath: string) => {
      for (const node of nodes) {
        if (node.id === selectedFileId) {
          foundPath = node.type === 'directory' ? node.path : parentPath;
          return true;
        }
        if (node.children && findParent(node.children, node.path)) return true;
      }
      return false;
    };
    findParent(fileTree, workspace?.path || '');
    return foundPath;
  }, [selectedFileId, fileTree, workspace]);

  const startCreate = (type: 'file' | 'directory') => {
    if (!workspace) return;
    const parentPath = getSelectedNodeParentPath();
    setCreatingState({ parentPath, type });
    
    // Ensure parent folder is expanded
    const parentNode = findNodeByPath(fileTree, parentPath);
    if (parentNode && !expandedFolders.has(parentNode.id)) {
      toggleFolder(parentNode.id);
    }
  };

  const submitCreate = async (name: string) => {
    if (!creatingState || !workspace || !name.trim()) {
      setCreatingState(null);
      return;
    }
    const { parentPath, type } = creatingState;
    const targetPath = `${parentPath}/${name}`;
    
    try {
      let newNode: FileNode;
      if (type === 'file') {
        const language = getLanguageFromExtension(name);
        const content = getDefaultContent(name, language);
        newNode = await fileService.createFile(targetPath, content);
        await refreshExplorer(true);
        openTab({
          id: `tab-${newNode.id}`,
          fileId: newNode.id,
          filePath: newNode.path,
          fileName: name,
          language,
          content,
          isDirty: false,
          isPreview: false,
          cursorPosition: { line: 1, column: 1 },
        });
      } else {
        await fileService.createFolder(targetPath);
        await refreshExplorer(true);
      }
    } catch (err) {
      addNotification({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create' });
    } finally {
      setCreatingState(null);
    }
  };

  const renameNode = async (node: FileNode) => {
    const newName = window.prompt('New name', node.name)?.trim();
    if (!newName || newName === node.name) return;

  const submitRename = async (node: FileNode, newName: string) => {
    setRenamingNodeId(null);
    if (!newName.trim() || newName === node.name) return;
    
    const separator = node.path.includes('\\\\') ? '\\\\' : '/';
    const parentPath = node.path.split(/[\\\\/]/).slice(0, -1).join(separator);
    const newPath = `${parentPath}${separator}${newName}`;

    try {
      await fileService.renameFile(node.path, newPath);
      await refreshExplorer(true);
    } catch (err) {
      addNotification({ type: 'error', message: err instanceof Error ? err.message : 'Failed to rename' });
    }
  };

  const deleteNode = async (node: FileNode) => {
    if (!window.confirm(`Are you sure you want to delete '${node.name}'?`)) return;
    try {
      await fileService.deleteFile(node.path);
      await refreshExplorer(true);
    } catch (err) {
      addNotification({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete' });
    }
  };

  const copyRelativePath = (node: FileNode) => {
    if (!workspace) return;
    const relative = node.path.replace(workspace.path, '').replace(/^[\\\\/]/, '').replace(/\\\\/g, '/');
    navigator.clipboard?.writeText(relative);
  };

  const collapseAll = () => {
    expandedFolders.forEach((folderId) => collapseFolder(folderId));
  };

  const handleFileClick = async (node: FileNode) => {
    if (node.type === 'directory') {
      toggleFolder(node.id);
      selectFile(node.id);
      return;
    }
    selectFile(node.id);
    const language = getLanguageFromExtension(node.name);
    const content = await readNodeContent(node, language);
    openTab({
      id: `tab-${node.id}`,
      fileId: node.id,
      filePath: node.path,
      fileName: node.name,
      language,
      content,
      isDirty: false,
      isPreview: false,
      cursorPosition: { line: 1, column: 1 },
    });
  };

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    selectFile(node.id);
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden" onClick={() => setContextMenu(null)}>
      <div className="flex h-9 items-center justify-between px-3 no-select">
        <span className="text-[11px] font-medium uppercase tracking-normal" style={{ color: 'var(--color-text)' }}>
          Explorer
        </span>
        {workspace ? (
          <div className="flex items-center gap-1">
            <IconBtn icon={<Plus size={14} />} title="New File" onClick={createFile} />
            <IconBtn icon={<FolderPlus size={14} />} title="New Folder" onClick={createFolder} />
            <IconBtn icon={<RefreshCw size={13} />} title="Refresh" onClick={refreshExplorer} />
            <IconBtn icon={<ChevronsDownUp size={13} />} title="Collapse All" onClick={collapseAll} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-1">
        {!workspace ? (
          <NoFolderOpened />
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center p-6 text-[var(--text-2)]">
            <Loader2 className="h-5 w-5 animate-spin mb-2" />
            <span className="text-xs">Loading project...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-6 text-[var(--error)] text-center">
            <AlertTriangle className="h-6 w-6 mb-2" />
            <span className="text-xs">{error}</span>
            <button className="mt-3 rounded bg-[var(--bg-2)] px-3 py-1 text-xs hover:bg-[var(--bg-3)] transition-colors" onClick={() => refreshExplorer()}>
              Retry
            </button>
          </div>
        ) : (
          <>
            {workspace.id !== 'ide-default' && !searchQuery && (
              <div className="px-2 py-1">
                <div className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-1)] no-select cursor-default">
                  <ChevronDown size={14} />
                  <span className="truncate">{workspace.name}</span>
                </div>
              </div>
            )}
            
            {/* Root level create input */}
            {creatingState && creatingState.parentPath === workspace.path && (
              <InlineInput 
                type={creatingState.type} 
                depth={0} 
                onSubmit={submitCreate} 
                onCancel={() => setCreatingState(null)} 
              />
            )}

            {filteredTree.map((node) => (
              <FileTreeNode
                key={node.id}
                node={node}
                depth={0}
                expandedFolders={expandedFolders}
                selectedFileId={selectedFileId}
                renamingNodeId={renamingNodeId}
                creatingState={creatingState}
                onFileClick={handleFileClick}
                onContextMenu={handleContextMenu}
                onSubmitRename={submitRename}
                onCancelRename={() => setRenamingNodeId(null)}
                onSubmitCreate={submitCreate}
                onCancelCreate={() => setCreatingState(null)}
              />
            ))}

            {filteredTree.length === 0 && !creatingState && (
              <div className="px-4 py-6 text-center text-xs text-[var(--text-2)]">
                {searchQuery ? 'No files match filter' : 'No project files yet.'}
              </div>
            )}
          </>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-lg py-1 text-xs shadow-2xl border border-[var(--border-1)] bg-[var(--bg-1)] backdrop-blur-xl"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            top: Math.min(contextMenu.y, window.innerHeight - 300),
            minWidth: 180,
          }}
        >
          {[
            { label: 'New File', action: () => void createFileInFolder(contextMenu.node.type === 'directory' ? contextMenu.node.path : contextMenu.node.path.split(/[\\/]/).slice(0, -1).join('/')) },
            { label: 'New Folder', action: () => void createFolderInFolder(contextMenu.node.type === 'directory' ? contextMenu.node.path : contextMenu.node.path.split(/[\\/]/).slice(0, -1).join('/')) },
            null,
            { label: 'Rename', action: () => void renameNode(contextMenu.node) },
            { label: 'Delete', action: () => void deleteNode(contextMenu.node) },
            null,
            { label: 'Copy Path', action: () => navigator.clipboard?.writeText(contextMenu.node.path) },
            { label: 'Copy Relative Path', action: () => copyRelativePath(contextMenu.node) },
            null,
            { label: 'Open in Integrated Terminal', action: () => {
              const targetDir = contextMenu.node.type === 'directory' ? contextMenu.node.path : contextMenu.node.path.split(/[\\/]/).slice(0, -1).join('/');
              setActiveBottomPanel('terminal');
              setBottomPanelVisible(true);
              window.setTimeout(() => {
                window.dispatchEvent(new CustomEvent('ai-web-ide:terminal-command', { detail: { action: 'new', cwd: targetDir } }));
              }, 50);
            }},
          ].map((item, i) =>
            item === null ? (
              <div key={i} className="my-1" style={{ borderTop: '1px solid var(--color-border)' }} />
            ) : (
              <button
                key={i}
                className={`w-full px-4 py-1.5 text-left transition-colors hover:bg-[var(--accent)] hover:text-white ${item.danger ? 'text-[var(--error)] hover:bg-[var(--error)]' : 'text-[var(--text-0)]'}`}
                onClick={() => {
                  if (item.action) item.action();
                  setContextMenu(null);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Inline Input Component for Rename/Create
function InlineInput({ 
  type, 
  initialValue = '', 
  depth, 
  onSubmit, 
  onCancel 
}: { 
  type: 'file' | 'directory', 
  initialValue?: string, 
  depth: number, 
  onSubmit: (val: string) => void, 
  onCancel: () => void 
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (initialValue) {
        const dotIndex = initialValue.lastIndexOf('.');
        if (dotIndex > 0 && type === 'file') {
          inputRef.current.setSelectionRange(0, dotIndex);
        } else {
          inputRef.current.select();
        }
      }
    }
  }, [initialValue, type]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      onSubmit(value);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="flex h-[24px] items-center gap-1 px-1 no-select"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <span className="w-4 flex-shrink-0" />
      <FileTypeIcon filename={value || (type === 'directory' ? 'folder' : 'file')} isDirectory={type === 'directory'} isOpen={false} size={16} />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onCancel()}
        className="ml-1 h-5 w-full bg-[var(--bg-2)] px-1 text-[13px] text-[var(--text-0)] outline-none border border-[var(--accent)]"
      />
    </div>
  );
}

// Tree Node Component
interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  expandedFolders: Set<string>;
  selectedFileId: string | null;
  renamingNodeId: string | null;
  creatingState: { parentPath: string; type: 'file' | 'directory' } | null;
  onFileClick: (node: FileNode) => void | Promise<void>;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onSubmitRename: (node: FileNode, newName: string) => void;
  onCancelRename: () => void;
  onSubmitCreate: (name: string) => void;
  onCancelCreate: () => void;
}

function FileTreeNode({ 
  node, depth, expandedFolders, selectedFileId, renamingNodeId, creatingState,
  onFileClick, onContextMenu, onSubmitRename, onCancelRename, onSubmitCreate, onCancelCreate 
}: FileTreeNodeProps) {
  const isExpanded = expandedFolders.has(node.id);
  const isSelected = selectedFileId === node.id;
  const isRenaming = renamingNodeId === node.id;
  const isCreatingInside = creatingState?.parentPath === node.path;

  return (
    <>
      {isRenaming ? (
        <InlineInput 
          type={node.type} 
          initialValue={node.name} 
          depth={depth} 
          onSubmit={(newName) => onSubmitRename(node, newName)} 
          onCancel={onCancelRename} 
        />
      ) : (
        <div
          className={`group flex h-[24px] cursor-pointer items-center gap-1 rounded-sm px-1 no-select transition-colors ${isSelected ? 'bg-[var(--accent)] text-white' : 'hover:bg-[var(--bg-2)] text-[var(--text-0)]'}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => void onFileClick(node)}
          onContextMenu={(e) => onContextMenu(e, node)}
        >
          {node.type === 'directory' ? (
            <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center ${isSelected ? 'text-white/80' : 'text-[var(--text-2)] group-hover:text-[var(--text-1)]'}`}>
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          <FileTypeIcon filename={node.name} isDirectory={node.type === 'directory'} isOpen={isExpanded} size={16} />
          <span className={`ml-0.5 truncate text-[13px] leading-none ${isSelected ? 'font-medium' : ''}`}>
            {node.name}
          </span>
        </div>
      )}

      {node.type === 'directory' && isExpanded && (
        <>
          {isCreatingInside && (
            <InlineInput 
              type={creatingState.type} 
              depth={depth + 1} 
              onSubmit={onSubmitCreate} 
              onCancel={onCancelCreate} 
            />
          )}
          {node.children?.map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              selectedFileId={selectedFileId}
              renamingNodeId={renamingNodeId}
              creatingState={creatingState}
              onFileClick={onFileClick}
              onContextMenu={onContextMenu}
              onSubmitRename={onSubmitRename}
              onCancelRename={onCancelRename}
              onSubmitCreate={onSubmitCreate}
              onCancelCreate={onCancelCreate}
            />
          ))}
        </>
      )}
    </>
  );
}

// Utilities
function findNodeByPath(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function IconBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick?: () => void }) {
  return (
    <button
      title={title}
      className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-2)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--text-0)]"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      {icon}
    </button>
  );
}

// No Folder Opened Component
function NoFolderOpened() {
  const openFolder = () => window.dispatchEvent(new CustomEvent('ai-web-ide:open-folder', { detail: { mode: 'open' } }));

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 rounded-full bg-[var(--bg-2)] p-4">
        <FolderPlus size={32} className="text-[var(--text-2)]" />
      </div>
      <h3 className="mb-2 text-sm font-semibold text-[var(--text-0)]">No project opened</h3>
      <p className="mb-6 text-xs text-[var(--text-2)] leading-relaxed">
        Open a folder to start working with your files, or ask the AI to generate a project.
      </p>
      <button
        onClick={openFolder}
        className="rounded bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-h)] shadow-sm"
      >
        Open Folder
      </button>
    </div>
  );
}
