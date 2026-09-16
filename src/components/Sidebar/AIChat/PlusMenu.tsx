import React, { useState, useRef, useEffect } from 'react';
import { Plus, Paperclip, Camera, FolderPlus, Globe, RotateCcw, Check, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { useAIStore } from '../../../store/aiStore';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { fileService } from '../../../services/fileService';

interface PlusMenuProps {
  onFileSelect?: (files: FileList) => void;
  onTakeScreenshot?: () => void;
  onAddToProject?: () => void;
}

export const PlusMenu: React.FC<PlusMenuProps> = ({
  onFileSelect,
  onTakeScreenshot,
  onAddToProject,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showProjectSubmenu, setShowProjectSubmenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { webSearchEnabled, memoryEnabled, toggleWebSearch, toggleMemory } = useAIStore();
  const { workspace, setWorkspace, recentWorkspaces } = useWorkspaceStore();

  // Click outside listener to close dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowProjectSubmenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Ctrl+U shortcut for file attachment
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect?.(e.target.files);
    }
  };

  const handleOpenFolder = () => {
    window.dispatchEvent(new CustomEvent('ai-web-ide:open-folder', { detail: { mode: 'open' } }));
    setIsOpen(false);
    setShowProjectSubmenu(false);
  };

  const handleCreateProject = async () => {
    const name = window.prompt('Enter new project name:');
    if (!name || !name.trim()) return;
    
    const projectPath = `/projects/${name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
    try {
      await fileService.createFolder(projectPath);
      setWorkspace({ name: name.trim(), path: projectPath, type: 'local' });
      window.dispatchEvent(new CustomEvent('ai-web-ide:workspace-changed'));
    } catch {
      setWorkspace({ name: name.trim(), path: projectPath, type: 'local' });
      window.dispatchEvent(new CustomEvent('ai-web-ide:workspace-changed'));
    }
    setIsOpen(false);
    setShowProjectSubmenu(false);
  };

  const handleSelectRecentProject = (proj: any) => {
    setWorkspace(proj);
    window.dispatchEvent(new CustomEvent('ai-web-ide:workspace-changed'));
    setIsOpen(false);
    setShowProjectSubmenu(false);
  };

  return (
    <div className="relative shrink-0" ref={menuRef}>
      {/* Hidden file input for "Add files or photos" / Ctrl U */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        accept="image/*,.txt,.js,.ts,.tsx,.jsx,.json,.css,.html,.py,.md,.c,.cpp,.h"
        className="hidden"
      />

      {/* Trigger + button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setShowProjectSubmenu(false);
        }}
        className={`p-1.5 text-[var(--text-1)] hover:text-[var(--text-0)] hover:bg-[var(--bg-1)] rounded-lg transition-colors flex items-center justify-center ${
          isOpen ? 'bg-[var(--bg-1)] text-[var(--text-0)]' : ''
        }`}
        title="Add files, screenshots, or toggles"
      >
        <Plus size={16} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-[var(--bg-1)] border border-[var(--border-0)] rounded-xl shadow-xl z-50 overflow-hidden flex flex-col p-1.5 animate-in fade-in zoom-in-95 duration-150">
          {!showProjectSubmenu ? (
            <>
              {/* Section 1 (attachments) */}
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setIsOpen(false);
                  }}
                  className="flex items-center justify-between px-3 py-2 text-xs text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-lg transition-colors w-full text-left group"
                >
                  <div className="flex items-center gap-2">
                    <Paperclip size={14} className="text-[var(--text-2)] group-hover:text-[var(--text-0)] transition-colors" />
                    <span>Add files or photos</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-3)] font-mono">Ctrl U</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onTakeScreenshot?.();
                    setIsOpen(false);
                  }}
                  className="flex items-center justify-between px-3 py-2 text-xs text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-lg transition-colors w-full text-left group"
                >
                  <div className="flex items-center gap-2">
                    <Camera size={14} className="text-[var(--text-2)] group-hover:text-[var(--text-0)] transition-colors" />
                    <span>Take a screenshot</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowProjectSubmenu(true);
                    onAddToProject?.();
                  }}
                  className="flex items-center justify-between px-3 py-2 text-xs text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-lg transition-colors w-full text-left group"
                >
                  <div className="flex items-center gap-2">
                    <FolderPlus size={14} className="text-[var(--text-2)] group-hover:text-[var(--text-0)] transition-colors" />
                    <span>Add to project</span>
                  </div>
                  <ChevronRight size={13} className="text-[var(--text-3)]" />
                </button>
              </div>

              {/* Divider */}
              <div className="my-1 border-t border-[var(--border-0)]" />

              {/* Section 2 (toggles) */}
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => {
                    toggleWebSearch();
                  }}
                  className="flex items-center justify-between px-3 py-2 text-xs text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-lg transition-colors w-full text-left group"
                >
                  <div className="flex items-center gap-2">
                    <Globe size={14} className="text-[var(--text-2)] group-hover:text-[var(--text-0)] transition-colors" />
                    <span>Web search</span>
                  </div>
                  {webSearchEnabled && <Check size={14} className="text-[var(--accent)]" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    toggleMemory();
                  }}
                  className="flex items-center justify-between px-3 py-2 text-xs text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-lg transition-colors w-full text-left group"
                >
                  <div className="flex items-center gap-2">
                    <RotateCcw size={14} className="text-[var(--text-2)] group-hover:text-[var(--text-0)] transition-colors" />
                    <span>Memory</span>
                  </div>
                  {memoryEnabled && <Check size={14} className="text-[var(--accent)]" />}
                </button>
              </div>
            </>
          ) : (
            /* Project Submenu */
            <div className="flex flex-col">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--border-0)] mb-1">
                <button
                  type="button"
                  onClick={() => setShowProjectSubmenu(false)}
                  className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1 font-medium"
                >
                  ← Back
                </button>
                <span className="text-[10px] font-semibold uppercase text-[var(--text-2)]">Project Options</span>
              </div>

              <button
                type="button"
                onClick={handleCreateProject}
                className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-lg transition-colors w-full text-left"
              >
                <FolderPlus size={14} className="text-green-400" />
                <span>Create new project</span>
              </button>

              <button
                type="button"
                onClick={handleOpenFolder}
                className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-lg transition-colors w-full text-left"
              >
                <FolderOpen size={14} className="text-blue-400" />
                <span>Open local folder</span>
              </button>

              {recentWorkspaces && recentWorkspaces.length > 0 && (
                <>
                  <div className="my-1 border-t border-[var(--border-0)]" />
                  <div className="px-2 py-1 text-[10px] font-semibold text-[var(--text-3)] uppercase">
                    Recent Projects
                  </div>
                  {recentWorkspaces.map((proj) => (
                    <button
                      key={proj.path}
                      type="button"
                      onClick={() => handleSelectRecentProject(proj)}
                      className="flex items-center justify-between px-3 py-1.5 text-xs text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-lg transition-colors w-full text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder size={13} className="text-[var(--text-2)] shrink-0" />
                        <span className="truncate">{proj.name}</span>
                      </div>
                      {workspace?.path === proj.path && <Check size={13} className="text-[var(--accent)] shrink-0" />}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
