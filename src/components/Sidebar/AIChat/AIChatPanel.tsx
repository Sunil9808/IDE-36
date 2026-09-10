import React, { useState } from 'react';
import { Menu, MessageSquare, Bot } from 'lucide-react';
import { ProfileSelector } from './ProfileSelector';
import { SessionList } from './SessionList';
import { AgentPanel } from './AgentPanel';
import { ChatView } from './ChatView';
import { ModelSelector } from './ModelSelector';

interface AIChatPanelProps {
  title?: string;
  onClose?: () => void;
}

type PanelMode = 'chat' | 'agent';

export default function AIChatPanel({ title = 'AI Assistant', onClose }: AIChatPanelProps) {
  const [showSessions, setShowSessions] = useState(false);
  const [mode, setMode] = useState<PanelMode>('chat');

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-1)] text-[var(--text-0)] relative overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex flex-col p-3 border-b border-[var(--border-0)] glass-panel z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Session history button */}
            <button
              onClick={() => setShowSessions(true)}
              className="p-1.5 hover:bg-[var(--hover)] rounded text-[var(--text-1)] hover:text-[var(--text-0)] transition-colors flex-shrink-0"
              title="Chat history"
            >
              <Menu size={18} />
            </button>

            {/* Mode tabs */}
            <div className="flex bg-[var(--bg-2)] rounded-lg p-0.5 border border-[var(--border-0)]">
              <button
                onClick={() => setMode('chat')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
                  mode === 'chat'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-2)] hover:text-[var(--text-0)]'
                }`}
              >
                <MessageSquare size={13} />
                Chat
              </button>
              <button
                onClick={() => setMode('agent')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
                  mode === 'agent'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-2)] hover:text-[var(--text-0)]'
                }`}
              >
                <Bot size={13} />
                Agent
              </button>
            </div>
          </div>

          {/* Model selector — right aligned */}
          <div className="flex-shrink-0 ml-2">
            <ModelSelector />
          </div>
        </div>

        {/* Profile selector — only shown in Chat mode */}
        {mode === 'chat' && <ProfileSelector />}
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-hidden min-h-0">
        {mode === 'chat' ? <ChatView /> : <AgentPanel />}
      </div>

      {/* Session history overlay */}
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
