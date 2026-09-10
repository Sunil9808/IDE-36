import React, { useEffect, useState } from 'react';
import { runtimeManager, RuntimeDiagnostic } from '../../../services/RuntimeManager';
import { CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';

export default function EnvironmentDiagnostics() {
  const [runtimes, setRuntimes] = useState<RuntimeDiagnostic[]>([]);

  useEffect(() => {
    setRuntimes(runtimeManager.getRuntimes());
    const unsubscribe = runtimeManager.subscribe(() => {
      setRuntimes(runtimeManager.getRuntimes());
    });
    
    // Check all on mount
    runtimeManager.checkAll();
    
    return unsubscribe;
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0e1011]">
      <div className="flex items-center justify-between p-3 border-b border-[#2b2d31]">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Environment Diagnostics</h2>
        <button 
          onClick={() => runtimeManager.checkAll()}
          className="text-gray-400 hover:text-white p-1 rounded"
          title="Re-check All Runtimes"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3">
        <p className="text-xs text-gray-400 mb-4">
          The Web IDE runs terminal processes using a backend shell. This diagnostic panel checks what runtimes are currently available on the host system.
        </p>
        
        <div className="space-y-3">
          {runtimes.map(rt => (
            <div key={rt.id} className="bg-[#1e1e1e] border border-[#2b2d31] rounded-md p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {rt.status === 'checking' && <Loader2 size={16} className="text-blue-400 animate-spin" />}
                {rt.status === 'available' && <CheckCircle2 size={16} className="text-green-500" />}
                {rt.status === 'unavailable' && <XCircle size={16} className="text-red-500" />}
                
                <div>
                  <div className="text-sm font-medium text-gray-200">{rt.name}</div>
                  <div className="text-xs text-gray-500 font-mono mt-1">{rt.command}</div>
                </div>
              </div>
              
              <div className="text-right">
                {rt.status === 'checking' && <span className="text-xs text-gray-400">Checking...</span>}
                {rt.status === 'unavailable' && <span className="text-xs text-red-400">Not Found</span>}
                {rt.status === 'available' && (
                  <span className="text-xs text-green-400 font-mono bg-green-400/10 px-2 py-1 rounded">
                    {rt.version || 'Available'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
