import { useState, useEffect } from 'react';
import { localServerManager, LocalServer } from '../../services/LocalServerManager';
import { AlertTriangle, Bell, Bot, GitBranch, Puzzle, Radio, Rocket, XCircle } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useExtensionStore } from '../../store/extensionStore';
import { useEditorStore } from '../../store/editorStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useSourceControlStore } from '../../store/sourceControlStore';
import { getActiveExtensionIds } from '../../services/extensionRuntime';

export default function StatusBar() {
  const {
    setActiveBottomPanel,
    setBottomPanelVisible,
    setRightPanelVisible,
    setActiveSidebarPanel,
    setSidebarVisible,
    addNotification,
  } = useUIStore();
  const installedExtensions = useExtensionStore((s) => s.installed);
  const activeTabLanguage = useEditorStore((s) => s.getActiveTab()?.language ?? '');
  const activeExtCount = getActiveExtensionIds().size;
  const workspace = useWorkspaceStore((s) => s.workspace);
  const branch = useSourceControlStore((s) => s.branch);

  const showPanel = (panel: 'terminal' | 'output' | 'problems' | 'debug' | 'ports') => {
    setActiveBottomPanel(panel);
    setBottomPanelVisible(true);
  };

  
  const [servers, setServers] = useState<LocalServer[]>([]);
  
  useEffect(() => {
     const unsubscribe = localServerManager.subscribe((newServers) => {
        setServers(newServers);
     });
     setServers(localServerManager.getServers());
     return () => { unsubscribe(); };
  }, []);

  const runDevServer = async () => {
    showPanel('terminal');
    window.dispatchEvent(new CustomEvent('ai-web-ide:terminal-command', { detail: { command: 'npm run dev' } }));
    addNotification({ type: 'success', message: 'Started project task in Terminal' });
  };

  const openExtensions = () => {
    setActiveSidebarPanel('extensions');
    setSidebarVisible(true);
  };

  return (
    <div className="status-bar no-select">
      {/* Left section */}
      <div className="status-bar-left">
        {/* Branch indicator — accent colored */}
        <button
          title="Source Control"
          aria-label="Source Control"
          className="status-btn status-branch"
          onClick={() => { setActiveSidebarPanel('git'); setSidebarVisible(true); }}
        >
          <GitBranch size={12} strokeWidth={2} />
          <span>{branch || (workspace?.name ? 'main' : 'No repo')}</span>
        </button>

        
          {servers.length > 0 && (
             <button
               title="Open Preview"
               className="status-btn text-green-400"
               onClick={() => {
                  window.dispatchEvent(new CustomEvent('ai-web-ide:server-registered', { detail: servers[servers.length - 1] }));
               }}
             >
                <div className="w-2 h-2 rounded-full bg-green-500 mr-1" />
                <span>localhost:{servers[servers.length - 1].port}</span>
             </button>
          )}


        <button
          title="Problems"
          aria-label="Problems panel"
          className="status-btn"
          onClick={() => showPanel('problems')}
        >
          <XCircle size={12} />
          <span>0</span>
          <AlertTriangle size={12} />
          <span>0</span>
        </button>
      </div>

      {/* Right section */}
      <div className="status-bar-right">
        {/* Language mode */}
        {activeTabLanguage && (
          <button
            title={`Language mode: ${activeTabLanguage}`}
            aria-label="Language mode"
            className="status-btn"
            onClick={() => addNotification({ type: 'info', message: `Active language: ${activeTabLanguage}` })}
          >
            <span style={{ textTransform: 'capitalize' }}>{activeTabLanguage}</span>
          </button>
        )}

        {/* Extensions */}
        <button
          title="Manage extensions"
          aria-label="Manage extensions"
          className="status-btn"
          onClick={openExtensions}
        >
          <Puzzle size={12} />
          <span>
            {installedExtensions.length > 0
              ? `${activeExtCount} active`
              : 'Extensions'}
          </span>
        </button>

        {/* AI */}
        <button
          title="Open Anywhere AI"
          aria-label="Open Anywhere AI"
          className="status-btn"
          onClick={() => setRightPanelVisible(true)}
          style={{ color: 'var(--accent)', fontWeight: 600 }}
        >
          <Bot size={12} />
          <span>AI</span>
        </button>

        {/* Ports */}
        <button
          title="Open Ports"
          aria-label="Open Ports"
          className="status-btn"
          onClick={() => showPanel('ports')}
        >
          <Radio size={12} />
          <span>Go Live</span>
        </button>

        {/* Notifications */}
        <button
          title="Notifications"
          aria-label="Notifications"
          className="status-btn"
          onClick={() => addNotification({ type: 'info', message: 'No new notifications' })}
        >
          <Bell size={12} />
        </button>
      </div>
    </div>
  );
}
