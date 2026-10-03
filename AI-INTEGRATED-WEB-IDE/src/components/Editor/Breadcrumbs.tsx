import { ChevronRight, LayoutTemplate } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import FileTypeIcon from '../Icons/FileTypeIcon';

export default function Breadcrumbs() {
  const { getActiveTab, splitConfig, setSplitConfig } = useEditorStore();
  const activeTab = getActiveTab();

  if (!activeTab) return null;

  const parts = activeTab.filePath.split('/').filter(Boolean);

  return (
    <div className="breadcrumbs no-select" aria-label="File breadcrumb">
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1;
        return (
          <span key={i} className="inline-flex items-center flex-shrink-0">
            {i > 0 && (
              <span className="breadcrumb-sep">
                <ChevronRight size={11} />
              </span>
            )}
            <span className={`breadcrumb-item${isLast ? ' last' : ''}`}>
              {isLast && (
                <FileTypeIcon filename={part} size={13} className="inline-block flex-shrink-0" />
              )}
              {part}
            </span>
          </span>
        );
      })}

      {/* Live preview toggle for HTML */}
      {activeTab.language === 'html' && (
        <div className="ml-auto flex items-center pl-4 flex-shrink-0">
          <button
            title="Toggle Live Preview"
            aria-label="Toggle Live Preview"
            onClick={() => setSplitConfig({ enabled: !splitConfig.enabled, direction: 'vertical' })}
            className="flex items-center gap-1.5 px-2 h-5 rounded transition-colors text-[11px]"
            style={{
              background: splitConfig.enabled ? 'var(--accent-dim)' : 'transparent',
              color: splitConfig.enabled ? 'var(--accent)' : 'var(--text-1)',
              border: `1px solid ${splitConfig.enabled ? 'rgba(124,109,245,0.3)' : 'transparent'}`,
            }}
          >
            <LayoutTemplate size={12} />
            {splitConfig.enabled ? 'Close Preview' : 'Live Preview'}
          </button>
        </div>
      )}
    </div>
  );
}
