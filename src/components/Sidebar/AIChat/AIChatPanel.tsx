import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Menu, Square, ArrowUp, Paperclip, FileCode2, MessageCircle, Edit2, Hammer, Bug, Bot } from 'lucide-react';
import { useAIChat } from '../../../hooks/useAIChat';
import { useEditorStore } from '../../../store/editorStore';
import { useAIStore } from '../../../store/aiStore';

import { ModelSelector } from './ModelSelector';
import { ProfileSelector } from './ProfileSelector';
import { MessageBubble } from './MessageBubble';
import { SessionList } from './SessionList';
import { WelcomeScreen } from './WelcomeScreen';
import { AgentPanel } from './AgentPanel';

interface AIChatPanelProps {
  title?: string;
  onClose?: () => void;
}

export type AIMode = 'chat' | 'edit' | 'build' | 'debug' | 'agent';

export default function AIChatPanel({ title = 'AI Assistant', onClose }: AIChatPanelProps) {
  const [activeMode, setActiveMode] = useState<AIMode>('chat');
  const [input, setInput] = useState('');
  const [showSessions, setShowSessions] = useState(false);
  
  const { messages, isStreaming, sendMessage, cancelStream } = useAIChat();
  const { getActiveTab } = useEditorStore();
  const { fetchModels } = useAIStore();
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const activeTab = getActiveTab();

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    
    let prefix = '';
    if (activeMode === 'edit') {
      prefix = '[EDIT MODE] Focus exclusively on modifying the currently active file or user selection based on the prompt. Do not scaffold new projects.';
    } else if (activeMode === 'debug') {
      prefix = '[DEBUG MODE] Focus exclusively on finding and fixing bugs, explaining errors, or analyzing the provided context for issues.';
    }

    sendMessage(input, prefix);
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const modes = [
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'edit', label: 'Edit', icon: Edit2 },
    { id: 'build', label: 'Build', icon: Hammer },
    { id: 'agent', label: 'Agent', icon: Bot },
    { id: 'debug', label: 'Debug', icon: Bug },
  ] as const;

  const handleActionSelect = (action: string) => {
    let prompt = '';
    const fileCtx = activeTab ? `\n\nFile: ${activeTab.fileName}` : '';
    
    switch(action) {
      case 'explain': prompt = `Explain how this code works${fileCtx}`; break;
      case 'debug': prompt = `Find and fix any bugs in this code${fileCtx}`; break;
      case 'generate': prompt = `Generate code for `; break;
      case 'refactor': prompt = `Refactor this code to improve quality${fileCtx}`; break;
      default: prompt = action;
    }
    
    setInput(prompt);
    inputRef.current?.focus();
  };

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
            <div className="flex bg-[var(--bg-2)] rounded-lg p-0.5 border border-[var(--border-0)] overflow-x-auto custom-scrollbar no-scrollbar w-full">
              {modes.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setActiveMode(m.id)}
                    title={m.label}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 shrink-0 ${activeMode === m.id ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-1)] hover:text-[var(--text-0)] hover:bg-[var(--hover)]'}`}
                  >
                    <Icon size={14} />
                    <span className="hidden sm:inline">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        
        {['chat', 'edit', 'debug'].includes(activeMode) && (
          <>
            <ModelSelector />
            <ProfileSelector />
          </>
        )}
      </div>

      {['build', 'agent'].includes(activeMode) ? (
        <AgentPanel mode={activeMode as 'build' | 'agent'} />
      ) : (
        <>
          {/* Main Chat Area */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {messages.length === 0 ? (
              <WelcomeScreen onActionSelect={handleActionSelect} />
            ) : (
              <div className="flex flex-col">
                {messages.map(msg => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="flex-shrink-0 p-4 bg-[var(--bg-2)] border-t border-[var(--border-0)] z-10 relative">
            {activeTab && (
              <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md text-xs w-fit">
                <FileCode2 size={12} />
                <span className="truncate max-w-[200px]">{activeTab.fileName}</span>
              </div>
            )}
            
            <div className="relative flex items-end bg-[var(--bg-0)] border border-[var(--border-1)] rounded-xl focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent-dim)] transition-all shadow-sm">
              <button className="p-3 text-[var(--text-1)] hover:text-[var(--text-0)] transition-colors shrink-0">
                <Paperclip size={18} />
              </button>
              
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? "AI is typing..." : activeMode === 'edit' ? "Describe how to modify the current file..." : activeMode === 'debug' ? "Paste an error or describe a bug..." : "Ask anything... (Shift+Enter for newline)"}
                className="w-full max-h-48 min-h-[44px] py-3 bg-transparent text-sm resize-none outline-none placeholder:text-gray-500 custom-scrollbar"
                rows={Math.min(5, Math.max(1, input.split('\n').length))}
                disabled={isStreaming}
              />
              
              <div className="p-2 shrink-0">
                {isStreaming ? (
                  <button 
                    onClick={cancelStream}
                    className="p-2 bg-[var(--error-dim)] hover:bg-[var(--error)] text-[var(--error)] hover:text-white rounded-lg transition-colors"
                    title="Stop Generating"
                  >
                    <Square size={16} fill="currentColor" />
                  </button>
                ) : (
                  <button 
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="p-2 bg-[var(--accent)] hover:bg-[var(--accentHover)] disabled:bg-[var(--bg-3)] disabled:text-[var(--text-1)] text-white rounded-lg transition-colors"
                  >
                    <ArrowUp size={16} strokeWidth={3} />
                  </button>
                )}
              </div>
            </div>
            <div className="text-center mt-2 text-[10px] text-[var(--text-2)]">
              AI can make mistakes. Verify critical code.
            </div>
          </div>
        </>
      )}

      {showSessions && <SessionList onClose={() => setShowSessions(false)} />}
    </div>
  );
}
