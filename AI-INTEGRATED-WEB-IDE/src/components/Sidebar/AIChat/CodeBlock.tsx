import React, { useState } from 'react';
import { Copy, Terminal, Check, Edit2 } from 'lucide-react';
import { useEditorStore } from '../../../store/editorStore';

interface CodeBlockProps {
  language: string;
  code: string;
  filename?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, code, filename }) => {
  const [copied, setCopied] = useState(false);
  const { getActiveTab, replaceTabContent } = useEditorStore();

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    const activeTab = getActiveTab();
    if (activeTab) {
      replaceTabContent(activeTab.id, code);
    }
  };

  const handleRun = () => {
    window.dispatchEvent(new CustomEvent('ai-web-ide:terminal-command', { detail: { command: code } }));
  };

  return (
    <div className="my-3 rounded-md overflow-hidden border border-gray-700/50 bg-[#0d1117] text-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-gray-700/50 text-gray-400 text-xs">
        <span className="font-mono">{filename || language}</span>
        <div className="flex items-center gap-2">
          {language === 'bash' || language === 'sh' ? (
            <button onClick={handleRun} className="hover:text-blue-400 transition-colors flex items-center gap-1" title="Run in Terminal">
              <Terminal size={14} />
            </button>
          ) : null}
          <button onClick={handleApply} className="hover:text-blue-400 transition-colors flex items-center gap-1" title="Apply to File">
            <Edit2 size={14} />
          </button>
          <button onClick={handleCopy} className="hover:text-blue-400 transition-colors flex items-center gap-1" title="Copy">
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <div className="p-3 overflow-x-auto text-gray-200">
        <pre className="font-mono text-[13px] leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};
