import { AlertCircle, AlertTriangle, XCircle, Info } from 'lucide-react';
import { useEditorStore } from '../../../store/editorStore';
import { useDiagnosticStore } from '../../../store/diagnosticStore';

export default function ProblemsPanel() {
  const diagnostics = useDiagnosticStore((state) => state.diagnostics);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const tabs = useEditorStore((state) => state.tabs);

  const handleClick = (file: string, line: number) => {
    const tab = tabs.find(t => t.fileName === file);
    if (tab) {
      setActiveTab(tab.id);
      window.dispatchEvent(new CustomEvent('ai-web-ide:go-to-line', { detail: { line } }));
    } else {
      // In a real app we'd open the file from the workspace
    }
  };

  if (!diagnostics.length) {
    return (
      <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--color-textMuted)' }}>
        <div className="text-center">
          <AlertCircle size={24} className="mx-auto mb-2 opacity-30" />
          <p>No problems have been detected in the workspace.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2">
      {diagnostics.map((diagnostic, idx) => (
        <div 
          key={idx} 
          onClick={() => handleClick(diagnostic.file, diagnostic.line)}
          className="flex items-start gap-2 rounded px-2 py-1 text-xs hover:bg-white/5 cursor-pointer"
        >
          {diagnostic.severity === 'error' 
            ? <XCircle size={14} className="mt-0.5 flex-shrink-0 text-red-400" />
            : <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#cca700' }} />
          }
          <div className="min-w-0">
            <div style={{ color: 'var(--color-text)' }}>{diagnostic.message}</div>
            <div className="truncate" style={{ color: 'var(--color-textMuted)' }}>
              {diagnostic.file}:{diagnostic.line} <span className="opacity-50">({diagnostic.source})</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
