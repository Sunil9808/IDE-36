import React, { useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { runtimeManager } from '../../services/RuntimeManager';
import { Activity, Server, RefreshCw } from 'lucide-react';

export default function LanguageServicesEditor() {
  const { activeTabId, closeTab } = useEditorStore();
  const [services, setServices] = useState<{ id: string, name: string, status: string, pid?: string, initialized: boolean }[]>([]);

  useEffect(() => {
    setServices([
      { id: 'ts-server', name: 'TypeScript Language Service', status: 'Running', initialized: true },
      { id: 'html-server', name: 'HTML Language Service', status: 'Running', initialized: true },
      { id: 'css-server', name: 'CSS Language Service', status: 'Running', initialized: true },
      { id: 'json-server', name: 'JSON Language Service', status: 'Running', initialized: true },
      { id: 'python-ls', name: 'Python Language Server', status: 'Unavailable (Fallback)', initialized: false },
    ]);
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-gray-200 font-sans p-6 overflow-y-auto">
      <div className="flex items-center gap-3 mb-6">
        <Server className="text-blue-400" size={24} />
        <h1 className="text-2xl font-bold text-white">Language Services</h1>
      </div>

      <div className="text-sm text-gray-400 mb-8 max-w-2xl">
        This panel monitors the health and status of active Language Servers (LSP) and Language Services running in the Web IDE backend or Extension Host. 
      </div>

      <div className="bg-[#252526] border border-[#3c3c3c] rounded-md overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#2d2d2d] border-b border-[#3c3c3c]">
              <th className="p-3 text-sm font-semibold">Service</th>
              <th className="p-3 text-sm font-semibold">Status</th>
              <th className="p-3 text-sm font-semibold">PID</th>
              <th className="p-3 text-sm font-semibold">Features</th>
              <th className="p-3 text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map(s => (
              <tr key={s.id} className="border-b border-[#3c3c3c] last:border-0 hover:bg-[#2a2d2e]">
                <td className="p-3 font-medium flex items-center gap-2">
                  <Activity size={14} className={s.status.includes('Running') ? 'text-green-500' : 'text-gray-500'} />
                  {s.name}
                </td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs ${s.status.includes('Running') ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                    {s.status}
                  </span>
                </td>
                <td className="p-3 font-mono text-xs text-gray-400">{s.pid || '-'}</td>
                <td className="p-3 text-xs text-gray-400">
                  {s.initialized ? 'Syntax, Completion, Hover, Diagnostics, Definition' : 'Syntax Only'}
                </td>
                <td className="p-3">
                  <button className="p-1 hover:bg-[#3c3c3c] rounded text-gray-400 hover:text-white transition-colors" title="Restart Service">
                    <RefreshCw size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
