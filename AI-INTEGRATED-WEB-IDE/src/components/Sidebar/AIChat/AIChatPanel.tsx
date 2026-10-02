import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Menu, Square, ArrowUp, Paperclip, FileCode2, MessageCircle, Edit2, Hammer, Bug, Bot, Plus, Image, AtSign, Zap, Globe, ChevronUp } from 'lucide-react';
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

export type AIMode = 'chat' | 'edit' | 'debug' | 'agent';

export default function AIChatPanel({ title = 'AI Assistant', onClose }: AIChatPanelProps) {
  const [activeMode, setActiveMode] = useState<AIMode>('chat');
  const [input, setInput] = useState('');
  const [showSessions, setShowSessions] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  
  const { messages, isStreaming, sendMessage, cancelStream } = useAIChat();
  const { getActiveTab } = useEditorStore();
  const { fetchModels } = useAIStore();
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large. Please select a file under 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (file.type.startsWith('image/')) {
        setInput(prev => prev ? `${prev}\n\n![${file.name}](${content})\n` : `![${file.name}](${content})\n`);
      } else {
        setInput(prev => prev ? `${prev}\n\nFile: ${file.name}\n\`\`\`\n${content}\n\`\`\`\n` : `File: ${file.name}\n\`\`\`\n${content}\n\`\`\`\n`);
      }
    };
    reader.onerror = () => {
      alert("Failed to read file.");
    };
    
    if (file.type.startsWith('image/')) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
    if (activeMode === 'chat') {
      prefix = '[CHAT MODE] Act as a general-purpose AI coding assistant and tutor. You have access to the user\'s currently active file and project context. If the user asks a question, always try to analyze and explain the project or the active file displayed on the IDE to answer their prompt accurately. Provide code snippets and architecture suggestions. Do NOT automatically make project changes or use agent tools to edit files.';
    } else if (activeMode === 'edit') {
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
            <div className="flex bg-[var(--bg-2)] rounded-lg p-0.5 border border-[var(--border-0)] flex-1 ml-2">
              <div className="text-xs font-semibold px-2 py-1 text-[var(--text-1)] truncate flex items-center">
                AI Pair
              </div>
            </div>
          </div>
        </div>
        
        {['chat', 'edit', 'debug'].includes(activeMode) && (
          <ProfileSelector />
        )}
      </div>

      {['edit', 'debug', 'agent'].includes(activeMode) ? (
        <AgentPanel mode={activeMode as 'edit' | 'debug' | 'agent'} onModeChange={setActiveMode} />
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
            
            <div className="relative flex flex-col bg-[var(--bg-0)] border border-[var(--border-1)] rounded-xl focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent-dim)] transition-all shadow-sm">
              <input type="file" ref={fileInputRef} onChange={handleFileAttach} className="hidden" />
              
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? "AI is typing..." : activeMode === 'debug' ? "Paste an error or describe a bug..." : "Ask anything... (Shift+Enter for newline)"}
                className="w-full max-h-48 min-h-[80px] p-3 bg-transparent text-sm resize-none outline-none placeholder:text-gray-500 custom-scrollbar"
                rows={Math.min(6, Math.max(3, input.split('\n').length))}
                disabled={isStreaming}
              />
              
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-1">
                  <div className="relative shrink-0">
                    <button 
                      onClick={() => setShowAttachMenu(!showAttachMenu)}
                      className="p-1.5 text-[var(--text-1)] hover:text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-md transition-colors flex items-center justify-center"
                      title="Add Context"
                    >
                      <Plus size={16} />
                    </button>
                    
                    {showAttachMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                        <div className="absolute bottom-full left-0 mb-2 w-48 bg-[var(--bg-1)] border border-[var(--border-0)] rounded-lg shadow-lg overflow-hidden flex flex-col z-50 animate-in fade-in zoom-in-95 duration-200">
                          <div className="px-3 py-2 text-xs font-semibold text-[var(--text-2)] border-b border-[var(--border-0)] bg-[var(--bg-2)]/50">
                            Add Context
                          </div>
                          <button 
                            onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}
                            className="flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--text-1)] hover:bg-[var(--bg-2)] hover:text-[var(--text-0)] transition-colors w-full text-left"
                          >
                            <Image size={14} /> Media
                          </button>
                          <button 
                            onClick={() => { alert("Mentions coming soon!"); setShowAttachMenu(false); }}
                            className="flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--text-1)] hover:bg-[var(--bg-2)] hover:text-[var(--text-0)] transition-colors w-full text-left"
                          >
                            <AtSign size={14} /> Mentions
                          </button>
                          <button 
                            onClick={() => { alert("Actions coming soon!"); setShowAttachMenu(false); }}
                            className="flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--text-1)] hover:bg-[var(--bg-2)] hover:text-[var(--text-0)] transition-colors w-full text-left"
                          >
                            <Zap size={14} /> Actions
                          </button>
                          <button 
                            onClick={() => { alert("Browser coming soon!"); setShowAttachMenu(false); }}
                            className="flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--text-1)] hover:bg-[var(--bg-2)] hover:text-[var(--text-0)] transition-colors w-full text-left"
                          >
                            <Globe size={14} /> Browser
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <ModelSelector />
                  
                  <div className="relative shrink-0">
                    <button 
                      onClick={() => setShowModeMenu(!showModeMenu)}
                      className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-[var(--text-1)] hover:text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-md transition-colors"
                      title="Switch Mode"
                    >
                      {modes.find(m => m.id === activeMode)?.label} <ChevronUp size={14} />
                    </button>
                    
                    {showModeMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowModeMenu(false)} />
                        <div className="absolute bottom-full left-0 mb-2 w-32 bg-[var(--bg-1)] border border-[var(--border-0)] rounded-lg shadow-lg overflow-hidden flex flex-col z-50 animate-in fade-in zoom-in-95 duration-200">
                          {modes.map(m => {
                            const Icon = m.icon;
                            return (
                              <button
                                key={m.id}
                                onClick={() => { setActiveMode(m.id); setShowModeMenu(false); }}
                                className={`flex items-center gap-2 px-3 py-2.5 text-sm transition-colors w-full text-left ${activeMode === m.id ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-1)] hover:bg-[var(--bg-2)] hover:text-[var(--text-0)]'}`}
                              >
                                <Icon size={14} /> {m.label}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="shrink-0 pr-1">
                  {isStreaming ? (
                    <button 
                      onClick={cancelStream}
                      className="p-1.5 bg-[var(--error-dim)] hover:bg-[var(--error)] text-[var(--error)] hover:text-white rounded-lg transition-colors"
                      title="Stop Generating"
                    >
                      <Square size={16} fill="currentColor" />
                    </button>
                  ) : (
                    <button 
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className="p-1.5 bg-[var(--accent)] hover:bg-[var(--accentHover)] disabled:bg-[var(--bg-3)] disabled:text-[var(--text-1)] text-white rounded-lg transition-colors"
                    >
                      <ArrowUp size={16} strokeWidth={3} />
                    </button>
                  )}
                </div>
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
