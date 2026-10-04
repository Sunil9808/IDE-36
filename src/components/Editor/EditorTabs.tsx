import { X, Circle, LayoutTemplate } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import FileTypeIcon from '../Icons/FileTypeIcon';

export default function EditorTabs() {
  const { tabs, activeTabId, setActiveTab, closeTab, splitConfig, setSplitConfig } = useEditorStore();

  if (tabs.length === 0) return null;

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
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  title="Unsaved changes — click to close"
                >
                  <span className="editor-tab-dirty" />
                </button>
              ) : (
                <button
                  aria-label={`Close ${tab.fileName}`}
                  className="editor-tab-close"
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  title="Close"
                >
                  <X size={11} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Live Preview toggle — HTML only */}
      {tabs.find(t => t.id === activeTabId)?.language === 'html' && (
        <div className="ml-auto flex items-center pr-3 h-full flex-shrink-0">
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
        </div>
      )}
    </div>
  );
}
