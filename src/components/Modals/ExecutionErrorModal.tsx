import React, { useEffect, useState } from 'react';
import { AlertCircle, X, Terminal, Settings } from 'lucide-react';

interface ExecutionError {
  type: string;
  title: string;
  message: string;
  required?: string;
  file?: string;
}

export default function ExecutionErrorModal() {
  const [error, setError] = useState<ExecutionError | null>(null);

  useEffect(() => {
    const handle = (e: CustomEvent<ExecutionError>) => {
      setError(e.detail);
    };
    window.addEventListener('ai-web-ide:execution-error' as any, handle);
    return () => window.removeEventListener('ai-web-ide:execution-error' as any, handle);
  }, []);

  if (!error) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="flex w-[480px] flex-col overflow-hidden rounded-md border shadow-2xl ide-bg ide-border ide-text">
        <div className="flex items-center justify-between border-b px-4 py-3 ide-border">
          <div className="flex items-center gap-2 font-medium text-red-400">
            <AlertCircle size={18} />
            {error.title}
          </div>
          <button onClick={() => setError(null)} className="opacity-50 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
        
        <div className="p-5 text-sm leading-relaxed space-y-4">
          <p>{error.message}</p>
          
          <div className="rounded border bg-black/20 p-3 ide-border space-y-2">
            {error.file && (
              <div className="flex justify-between">
                <span className="opacity-60">File:</span>
                <span className="font-mono">{error.file}</span>
              </div>
            )}
            {error.required && (
              <div className="flex justify-between">
                <span className="opacity-60">Required:</span>
                <span className="font-mono text-yellow-300">{error.required}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="opacity-60">Status:</span>
              <span className="text-red-400">Not detected</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-3 ide-border bg-black/10">
          <button 
            onClick={() => {
              setError(null);
              window.dispatchEvent(new CustomEvent('ai-web-ide:open-terminal'));
            }} 
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium hover:bg-white/10"
          >
            <Terminal size={14} /> Open Terminal
          </button>
          <button 
            onClick={() => setError(null)} 
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            <Settings size={14} /> Configure
          </button>
        </div>
      </div>
    </div>
  );
}
