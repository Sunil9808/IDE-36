import { X, Plus, Terminal as TerminalIcon, Bug, AlertCircle, Radio, Eye, List } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import Terminal from './Terminal/Terminal';
import OutputPanel from './Output/OutputPanel';
import ProblemsPanel from './Problems/ProblemsPanel';
import PreviewPanel from './Preview/PreviewPanel';

const PANEL_TABS = [
  { id: 'terminal',  label: 'Terminal',      icon: TerminalIcon },
  { id: 'preview',   label: 'Preview',       icon: Eye },
  { id: 'output',    label: 'Output',        icon: List },
  { id: 'problems',  label: 'Problems',      icon: AlertCircle },
  { id: 'debug',     label: 'Debug Console', icon: Bug },
  { id: 'ports',     label: 'Ports',         icon: Radio },
] as const;

export default function BottomPanel() {
  const { activeBottomPanel, setActiveBottomPanel, setBottomPanelVisible } = useUIStore();

  const openNewTerminal = () => {
    setActiveBottomPanel('terminal');
    setBottomPanelVisible(true);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('ai-web-ide:terminal-command', { detail: { action: 'new' } }));
    }, 50);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel tab bar */}
      <div className="panel-tabs no-select">
        <div className="flex items-center flex-1 overflow-x-auto no-scrollbar">
          {PANEL_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeBottomPanel === id}
              onClick={() => setActiveBottomPanel(id as typeof activeBottomPanel)}
              className={`panel-tab${activeBottomPanel === id ? ' active' : ''}`}
            >
              <Icon size={12} strokeWidth={activeBottomPanel === id ? 2.2 : 1.6} />
              {label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 px-2 flex-shrink-0">
          <button
            title="New Terminal"
            aria-label="New Terminal"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/8"
            style={{ color: 'var(--text-1)' }}
            onClick={openNewTerminal}
          >
            <Plus size={13} />
          </button>
          <button
            title="Close Panel"
            aria-label="Close Panel"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/8"
            style={{ color: 'var(--text-1)' }}
            onClick={() => setBottomPanelVisible(false)}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Panel content (Keep Terminal mounted with display toggle so PTY session is never lost) */}
      <div className="flex-1 overflow-hidden relative">
        <div style={{ display: activeBottomPanel === 'terminal' ? 'block' : 'none', height: '100%', width: '100%' }}>
          <Terminal />
        </div>
        {activeBottomPanel === 'preview' && <PreviewPanel />}
        {activeBottomPanel === 'output' && <OutputPanel />}
        {activeBottomPanel === 'problems' && <ProblemsPanel />}
        {activeBottomPanel !== 'terminal' && activeBottomPanel !== 'preview' && activeBottomPanel !== 'output' && activeBottomPanel !== 'problems' && (
          <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-1)' }}>
            {activeBottomPanel} panel
          </div>
        )}
      </div>
    </div>
  );
}
