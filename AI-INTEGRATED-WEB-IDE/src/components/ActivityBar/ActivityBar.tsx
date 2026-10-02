import {
  Bug,
  CircleUserRound,
  Files,
  GitBranch,
  Puzzle,
  Search,
  Settings,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useEditorStore } from '../../store/editorStore';
import { useExtensionStore } from '../../store/extensionStore';

const activities = [
  { id: 'explorer',   icon: Files,     title: 'Explorer (Ctrl+Shift+E)' },
  { id: 'search',     icon: Search,    title: 'Search (Ctrl+Shift+F)' },
  { id: 'git',        icon: GitBranch, title: 'Source Control (Ctrl+Shift+G)' },
  { id: 'debug',      icon: Bug,       title: 'Run and Debug (Ctrl+Shift+D)' },
  { id: 'extensions', icon: Puzzle,    title: 'Extensions (Ctrl+Shift+X)' },
  { id: 'thunder',    icon: Zap,       title: 'Thunder Client' },
  { id: 'ai',         icon: Sparkles,  title: 'Anywhere AI (Ctrl+Alt+I)' },
];

export default function ActivityBar() {
  const {
    activeSidebarPanel,
    setActiveSidebarPanel,
    sidebarVisible,
    setSidebarVisible,
    rightPanelVisible,
    setRightPanelVisible,
    addNotification,
  } = useUIStore();
  const openTab = useEditorStore((s) => s.openTab);
  const installedCount = useExtensionStore((s) => s.installed.length);

  const openSettings = () => {
    openTab({
      id: 'tab-ide-settings',
      fileId: 'ide-settings',
      filePath: '/settings/ide',
      fileName: 'Settings',
      language: 'ide-settings',
      content: '',
      isDirty: false,
      isPreview: false,
      cursorPosition: { line: 1, column: 1 },
    });
  };

  const handleClick = (id: string) => {
    if (id === 'ai') {
      setRightPanelVisible(!rightPanelVisible);
      return;
    }
    if (activeSidebarPanel === id && sidebarVisible) {
      setSidebarVisible(false);
      return;
    }
    setActiveSidebarPanel(id as 'explorer' | 'search' | 'git' | 'debug' | 'extensions' | 'thunder' | 'ai');
    setSidebarVisible(true);
  };

  return (
    <div className="activity-bar no-select">
      {/* Top icons */}
      <div className="flex flex-1 flex-col items-center pt-1">
        {activities.map(({ id, icon: Icon, title }) => {
          const isActive = id === 'ai'
            ? rightPanelVisible
            : activeSidebarPanel === id && sidebarVisible;

          return (
            <button
              key={id}
              title={title}
              aria-label={title}
              onClick={() => handleClick(id)}
              className={`activity-bar-btn${isActive ? ' active' : ''}`}
            >
              <span className="activity-icon">
                <Icon
                  size={id === 'ai' ? 19 : 18}
                  strokeWidth={isActive ? 2.2 : 1.6}
                />
              </span>

              {/* Extensions badge */}
              {id === 'extensions' && installedCount > 0 && (
                <span className="ext-badge" style={{ top: 4, right: 4, minWidth: 14, height: 14, fontSize: 9 }}>
                  {installedCount > 99 ? '99+' : installedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom icons */}
      <div className="flex flex-col items-center pb-1">
        <button
          title="Accounts"
          aria-label="Accounts"
          onClick={() => addNotification({ type: 'info', message: 'Signed in as local workspace user' })}
          className="activity-bar-btn"
        >
          <span className="activity-icon">
            <CircleUserRound size={18} strokeWidth={1.6} />
          </span>
        </button>
        <button
          title="Settings"
          aria-label="Settings"
          onClick={openSettings}
          className="activity-bar-btn"
          style={{ transition: 'color var(--t-fast), transform 200ms' }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'rotate(30deg)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'rotate(0deg)')}
        >
          <span className="activity-icon">
            <Settings size={18} strokeWidth={1.6} />
          </span>
        </button>
      </div>
    </div>
  );
}
