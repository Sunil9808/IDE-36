import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { ProfileSelector } from './ProfileSelector';
import { SessionList } from './SessionList';
import { AgentPanel } from './AgentPanel';

interface AIChatPanelProps {
  title?: string;
  onClose?: () => void;
}

export default function AIChatPanel({ title = 'AI Assistant', onClose }: AIChatPanelProps) {
  const [showSessions, setShowSessions] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-1)] text-[var(--text-0)] relative overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex flex-col p-3 border-b border-[var(--border-0)] glass-panel z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSessions(true)}
              className="p-1.5 hover:bg-[var(--hover)] rounded text-[var(--text-1)] hover:text-[var(--text-0)] transition-colors"
            >
              <Menu size={18} />
            </button>
            <div className="flex bg-[var(--bg-2)] rounded-lg p-0.5 border border-[var(--border-0)] flex-1 ml-2">
              <div className="text-xs font-semibold px-2 py-1 text-[var(--text-1)] truncate flex items-center">
                AI Pair
              </div>
            </div>
          </div>
        </div>
        
        <ProfileSelector />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        <AgentPanel />
      </div>

      {showSessions && (
        <div className="absolute inset-0 z-50 bg-[var(--bg-1)] animate-in slide-in-from-left">
          <div className="p-3 border-b border-[var(--border-0)] flex items-center justify-between">
            <h2 className="font-semibold text-[var(--text-1)]">Chat History</h2>
            <button 
              onClick={() => setShowSessions(false)}
              className="p-1.5 hover:bg-[var(--hover)] rounded text-[var(--text-2)]"
            >
              ✕
            </button>
          </div>
          <SessionList onClose={() => setShowSessions(false)} />
        </div>
      )}
    </div>
  );
}
