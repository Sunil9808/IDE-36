import { useEffect, useRef, useState } from 'react';
import TitleBar from '../components/TitleBar/TitleBar';
import ActivityBar from '../components/ActivityBar/ActivityBar';
import Sidebar from '../components/Sidebar/Sidebar';
import Editor from '../components/Editor/Editor';
import BottomPanel from '../components/BottomPanel/BottomPanel';
import StatusBar from '../components/StatusBar/StatusBar';
import CommandPalette from '../components/Editor/CommandPalette';
import AIChatPanel from '../components/Sidebar/AIChat/AIChatPanel';
import { Sparkles } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useFileStore } from '../store/fileStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useEditorStore } from '../store/editorStore';
import { terminalService } from '../services/terminalService';
import { useTerminalStore } from '../store/terminalStore';
import { initializeExtensionRuntime } from '../services/extensionRuntime';
import { ErrorParser } from '../services/execution/ErrorParser';
import ExecutionErrorModal from '../components/Modals/ExecutionErrorModal';

export default function WorkspaceLayout() {
  const {
    activityBarVisible,
    sidebarVisible, sidebarWidth, setSidebarWidth,
    bottomPanelVisible, bottomPanelHeight, setBottomPanelHeight,
    rightPanelVisible, rightPanelWidth, setRightPanelVisible, setRightPanelWidth,
    statusBarVisible,
    centeredLayout,
    commandPaletteOpen,
  } = useUIStore();
  const { setFileTree } = useFileStore();
  const { setWorkspace } = useWorkspaceStore();
  const { addSession } = useTerminalStore();
  const { closeAllTabs } = useEditorStore();

  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isDraggingBottom, setIsDraggingBottom] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('clean') === '1') {
      closeAllTabs();
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('clean');
      window.history.replaceState({}, '', cleanUrl.pathname + (cleanUrl.search !== '?' ? cleanUrl.search : ''));
    }

    setWorkspace(null);
    setFileTree([]);

    const cleanupRuntime = initializeExtensionRuntime();
    terminalService.connect();
    terminalService.onSessionCreated((session) => {
      addSession(session);
    });

    const handleParseErrors = (e: any) => ErrorParser.parseTerminalOutput(e.detail);
    window.addEventListener('ai-web-ide:parse-errors', handleParseErrors);

    return () => {
      cleanupRuntime();
      terminalService.disconnect();
      window.removeEventListener('ai-web-ide:parse-errors', handleParseErrors);
    };
  }, []);

  // Sidebar resize
  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSidebar(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(400, startWidth + (e.clientX - startX)));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      setIsDraggingSidebar(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Right panel resize
  const handleRightPanelMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
    const startX = e.clientX;
    const startWidth = rightPanelWidth;
    const onMouseMove = (event: MouseEvent) => {
      const newWidth = Math.max(240, Math.min(560, startWidth + (startX - event.clientX)));
      setRightPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      setIsDraggingRight(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Bottom panel resize
  const handleBottomMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingBottom(true);
    const startY = e.clientY;
    const startHeight = bottomPanelHeight;
    const onMouseMove = (e: MouseEvent) => {
      const newHeight = Math.max(100, Math.min(600, startHeight + (startY - e.clientY)));
      setBottomPanelHeight(newHeight);
    };
    const onMouseUp = () => {
      setIsDraggingBottom(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{
        background: 'var(--color-background)',
        color: 'var(--color-text)',
        userSelect: isDraggingSidebar || isDraggingBottom || isDraggingRight ? 'none' : 'auto',
      }}
    >
      {/* Title Bar */}
      <TitleBar />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Activity Bar */}
        {activityBarVisible && <ActivityBar />}

        {/* Sidebar */}
        {sidebarVisible && (
          <>
            <div style={{ width: sidebarWidth, minWidth: 180, maxWidth: 400, flexShrink: 0, background: 'var(--color-sidebar)', borderRight: '1px solid var(--border-0)', overflow: 'hidden' }}>
              <Sidebar />
            </div>
            {/* Sidebar resize handle */}
            <div
              className={`resize-handle-v resize-handle${isDraggingSidebar ? ' dragging' : ''}`}
              onMouseDown={handleSidebarMouseDown}
              aria-label="Resize sidebar"
              role="separator"
            />
          </>
        )}

        {/* Editor + Bottom Panel */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Editor area */}
          <div
            className="flex-1 overflow-hidden"
            style={{
              display: 'flex',
              justifyContent: centeredLayout ? 'center' : 'stretch',
              background: 'var(--color-background)',
            }}
          >
            <div style={{ width: centeredLayout ? 'min(100%, 1200px)' : '100%', height: '100%' }}>
              <Editor />
            </div>
          </div>

          {/* Bottom panel resize handle */}
          {bottomPanelVisible && (
            <div
              className={`resize-handle-h resize-handle${isDraggingBottom ? ' dragging' : ''}`}
              onMouseDown={handleBottomMouseDown}
              aria-label="Resize bottom panel"
              role="separator"
            />
          )}

          {/* Bottom Panel */}
          {bottomPanelVisible && (
            <div style={{ height: bottomPanelHeight, flexShrink: 0, background: 'var(--color-panel)', borderTop: '1px solid var(--border-0)', overflow: 'hidden' }}>
              <BottomPanel />
            </div>
          )}
        </div>

        {/* Right Panel (AI) */}
        {rightPanelVisible && (
          <>
            <div
              className={`resize-handle-v resize-handle${isDraggingRight ? ' dragging' : ''}`}
              onMouseDown={handleRightPanelMouseDown}
              aria-label="Resize AI panel"
              role="separator"
            />
            <div style={{ width: rightPanelWidth, flexShrink: 0, background: 'var(--color-sidebar)', borderLeft: '1px solid var(--border-0)', overflow: 'hidden' }}>
              <AIChatPanel title="Anywhere AI" onClose={() => setRightPanelVisible(false)} />
            </div>
          </>
        )}

        {/* AI Float Button (when panel is closed) */}
        {!rightPanelVisible && (
          <button
            className="ai-float-btn"
            title="Open Anywhere AI"
            aria-label="Open Anywhere AI"
            onClick={() => setRightPanelVisible(true)}
          >
            <span className="ai-float-btn-icon">
              <Sparkles size={15} strokeWidth={2.2} />
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                writingMode: 'vertical-rl',
                color: 'var(--text-1)',
                textTransform: 'uppercase',
              }}
            >
              AI
            </span>
          </button>
        )}
      </div>

      {/* Status Bar */}
      {statusBarVisible && <StatusBar />}

      {/* Command Palette Overlay */}
      {commandPaletteOpen && <CommandPalette />}
      <ExecutionErrorModal />
    </div>
  );
}
