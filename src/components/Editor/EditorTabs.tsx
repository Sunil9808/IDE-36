import { X, Circle, LayoutTemplate } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { useUIStore } from '../../store/uiStore';
import FileTypeIcon from '../Icons/FileTypeIcon';

export default function EditorTabs() {
  const { tabs, activeTabId, setActiveTab, closeTab, closeAllTabs, splitConfig, setSplitConfig, saveTab } = useEditorStore();
  const setContextMenu = useUIStore(state => state.setContextMenu);

  if (tabs.length === 0) return null;

  const handleCloseTab = (e: React.MouseEvent, tab: any) => {
    e.stopPropagation();
    if (tab.isDirty) {
      if (window.confirm(`Do you want to save the changes you made to ${tab.fileName}?\n\nPress OK to Save and Close. Press Cancel to keep it open.`)) {
        saveTab(tab.id);
        closeTab(tab.id);
      }
    } else {
      closeTab(tab.id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tab: any) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { id: 'close', label: 'Close', action: () => closeTab(tab.id) },
        { id: 'close-others', label: 'Close Others', action: () => {
            tabs.forEach(t => { if (t.id !== tab.id) closeTab(t.id); });
        }},
        { id: 'close-all', label: 'Close All', action: closeAllTabs },
      ]
    });
  };

  return (
    <div className="editor-tabs-bar no-select">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            className={`editor-tab${isActive ? ' active' : ''} group`}
            onClick={() => setActiveTab(tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab)}
          >
            {/* File icon */}
            <FileTypeIcon filename={tab.fileName} size={14} className="flex-shrink-0 opacity-80" />

            {/* File name */}
            <span className="truncate flex-1" style={{ fontSize: 12.5 }}>
              {tab.fileName}
            </span>

            {/* Dirty dot / close button */}
            <div className="flex-shrink-0 w-[18px] h-[18px] flex items-center justify-center">
              {tab.isDirty ? (
                <button
                  aria-label={`Close ${tab.fileName} (unsaved)`}
                  className="editor-tab-close"
                  onClick={(e) => handleCloseTab(e, tab)}
                  title="Unsaved changes — click to close"
                >
                  <span className="editor-tab-dirty" />
                </button>
              ) : (
                <button
                  aria-label={`Close ${tab.fileName}`}
                  className="editor-tab-close"
                  onClick={(e) => handleCloseTab(e, tab)}
                  title="Close"
                >
                  <X size={11} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Right Side Buttons */}
      <div className="ml-auto flex items-center gap-2 pr-3 h-full flex-shrink-0">
        <RunButton activeTabId={activeTabId} />

        {/* Live Preview toggle — HTML only */}
        {tabs.find(t => t.id === activeTabId)?.language === 'html' && (
            <button
              aria-label="Toggle live preview"
              onClick={() => setSplitConfig({ enabled: !splitConfig.enabled, direction: 'vertical' })}
              className="ide-btn ide-btn-secondary"
              style={{
                height: 24,
                fontSize: 12,
                padding: '0 10px',
                background: splitConfig.enabled ? 'var(--accent)' : 'transparent',
                color: splitConfig.enabled ? 'white' : 'var(--text-1)',
                borderColor: splitConfig.enabled ? 'var(--accent)' : 'var(--border-1)',
              }}
            >
              <LayoutTemplate size={13} />
              {splitConfig.enabled ? 'Close Preview' : 'Live Preview'}
            </button>
        )}
      </div>
    </div>
  );
}

import { Play, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { executionService, ExecutionState } from '../../services/executionService';


function RunButton({ activeTabId }: { activeTabId: string | null }) {
  const { tabs } = useEditorStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  const [state, setState] = useState<ExecutionState>('idle');

  useEffect(() => {
    if (!activeTab?.filePath) return;
    const current = executionService.getState(activeTab.filePath);
    setState(current);
    
    const handler = (s: ExecutionState) => setState(s);
    executionService.subscribe(activeTab.filePath, handler);
    return () => executionService.unsubscribe(activeTab.filePath);
  }, [activeTab?.filePath]);

  if (!activeTab) return null;

  const isProject = executionService.isFrameworkFile(activeTab.fileName) || activeTab.fileName === 'package.json' || activeTab.language === 'html';
  const lang = executionService.detectLanguage(activeTab.fileName);
  
  if (!isProject && !lang) return null; // Hide run button for unsupported files

  const handleRun = () => {
    if (state === 'running') {
      executionService.stop(activeTab.filePath);
    } else {
      executionService.runFile(activeTab.filePath, activeTab.content || '');
    }
  };

  useEffect(() => {
    const fn = () => handleRun();
    window.addEventListener('ai-web-ide:terminal-run-active', fn);
    return () => window.removeEventListener('ai-web-ide:terminal-run-active', fn);
  }, [state, activeTab]);

  const label = isProject ? 'Run Project' : 'Run File';

  return (
    <button
      onClick={handleRun}
      title={state === 'running' ? 'Stop' : label}
      className={`flex items-center gap-2 px-3 h-[24px] rounded text-xs font-medium transition-colors ${
        state === 'running'
          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
          : 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20'
      }`}
    >
      {state === 'running' ? (
        <>
          <Square size={10} className="fill-current" />
          <span>Stop</span>
        </>
      ) : (
        <>
          <Play size={10} className="fill-current" />
          <span>Run</span>
          {lang && <span className="text-[10px] opacity-70 border-l border-green-500/30 pl-2 ml-1">{lang.toUpperCase()}</span>}
        </>
      )}
    </button>
  );

}

