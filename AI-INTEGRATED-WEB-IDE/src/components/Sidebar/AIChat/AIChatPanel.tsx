import React, { useState } from 'react';
import { Menu, Sparkles } from 'lucide-react';
import { ProfileSelector } from './ProfileSelector';
import { SessionList } from './SessionList';
import { AgentPanel } from './AgentPanel';
import { ChatView } from './ChatView';
import { useAIStore } from '../../../store/aiStore';

interface AIChatPanelProps {
  title?: string;
  onClose?: () => void;
}

export default function AIChatPanel({ title = 'AI Assistant', onClose }: AIChatPanelProps) {
  const [showSessions, setShowSessions] = useState(false);
  const { activeMode } = useAIStore();

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-1)] text-[var(--text-0)] relative overflow-hidden">
      {/* Top Header */}
      <div className="flex-shrink-0 flex flex-col p-2.5 border-b border-[var(--border-0)] glass-panel z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSessions(true)}
              className="p-1.5 hover:bg-[var(--hover)] rounded-lg text-[var(--text-1)] hover:text-[var(--text-0)] transition-colors"
              title="Chat history"
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-1.5 font-semibold text-sm text-[var(--text-0)]">
              <Sparkles size={16} className="text-[var(--accent)]" />
              <span>{title}</span>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-[var(--hover)] rounded-lg text-[var(--text-2)] hover:text-[var(--text-0)] transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Profile selector — only shown in Chat mode */}
        {activeMode === 'chat' && <ProfileSelector />}
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeMode === 'chat' ? <ChatView /> : <AgentPanel />}
      </div>

      {/* Session History Overlay */}
      {showSessions && (
        <div className="absolute inset-0 z-50 bg-[var(--bg-1)] animate-in slide-in-from-left">
          <div className="p-3 border-b border-[var(--border-0)] flex items-center justify-between">
            <h2 className="font-semibold text-[var(--text-1)]">Chat History</h2>
            <button
              onClick={() => setShowSessions(false)}
              className="p-1.5 hover:bg-[var(--hover)] rounded-lg text-[var(--text-2)]"
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
