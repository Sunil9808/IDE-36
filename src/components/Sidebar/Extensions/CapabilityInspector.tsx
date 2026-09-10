import React, { useEffect, useState } from 'react';
import { extensionHost } from '../../../services/extensionHost/extensionHostMain';
import { useExtensionStore } from '../../../store/extensionStore';
import { getActiveExtensionIds } from '../../../services/extensionRuntime';

export default function CapabilityInspector() {
  const [capabilities, setCapabilities] = useState<any>(null);
  const installed = useExtensionStore(state => state.installed);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());

  const fetchState = async () => {
    setActiveIds(getActiveExtensionIds());
    try {
      const caps = await extensionHost.getRegisteredCapabilities();
      setCapabilities(caps);
    } catch (e) {
      console.error('Failed to fetch capabilities', e);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-2.5 mt-2.5 text-xs border-t" style={{ background: 'var(--surface-bg)', borderColor: 'var(--border-color)' }}>
      <div className="flex justify-between items-center mb-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
        <span>Extension Health & Capabilities</span>
        <button 
          onClick={fetchState}
          className="bg-transparent border-none cursor-pointer text-[11px] hover:underline"
          style={{ color: 'var(--primary-color)' }}
        >
          Refresh
        </button>
      </div>
      
      {installed.map(ext => {
        const isActive = activeIds.has(ext.id);
        const formatters = capabilities?.formatters?.filter((f: string) => f.includes(ext.id) || ext.id.includes('formatter')).length || 0;
        const completions = capabilities?.completions?.filter((c: string) => c.includes(ext.id) || ext.id.includes('completion')).length || 0;
        const commands = capabilities?.commands?.filter((c: string) => c.includes(ext.id) || c.includes(ext.publisher)).length || 0;
        const diagnostics = capabilities?.diagnostics?.filter((d: string) => d.includes(ext.id) || ext.id.includes('diagnostic')).length || 0;
        
        return (
          <div key={ext.id} className="mb-2 p-1.5 rounded" style={{ background: 'var(--bg-color)' }}>
            <div className="flex items-center gap-1 mb-1 font-medium" style={{ color: 'var(--text-primary)' }}>
              <div 
                className="w-1.5 h-1.5 rounded-full" 
                style={{ backgroundColor: isActive ? 'var(--success-color, #4ccb70)' : 'var(--text-secondary)' }}
                title={isActive ? "Active" : "Inactive (Waiting for Activation Event)"} 
              />
              {ext.displayName}
            </div>
            <div className="flex flex-wrap gap-1">
              {isActive ? (
                <>
                  {formatters > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] border" style={{ background: 'var(--surface-bg)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Formatter ✓</span>}
                  {completions > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] border" style={{ background: 'var(--surface-bg)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Autocomplete ✓</span>}
                  {commands > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] border" style={{ background: 'var(--surface-bg)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>{commands} Commands ✓</span>}
                  {diagnostics > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] border" style={{ background: 'var(--surface-bg)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Diagnostics ✓</span>}
                  {formatters === 0 && completions === 0 && commands === 0 && diagnostics === 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] border" style={{ background: 'var(--surface-bg)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Active (No Providers)</span>
                  )}
                </>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] border" style={{ background: 'var(--surface-bg)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Inactive</span>
              )}
            </div>
          </div>
        );
      })}
      
      {installed.length === 0 && (
        <div style={{ color: 'var(--text-secondary)' }}>No extensions installed.</div>
      )}
    </div>
  );
}
