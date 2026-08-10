import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Menu, Square, ArrowUp, Paperclip, FileCode2 } from 'lucide-react';
import { useAIChat } from '../../../hooks/useAIChat';
import { useEditorStore } from '../../../store/editorStore';
import { useAIStore } from '../../../store/aiStore';

import { ModelSelector } from './ModelSelector';
import { ProfileSelector } from './ProfileSelector';
import { MessageBubble } from './MessageBubble';
import { SessionList } from './SessionList';
import { WelcomeScreen } from './WelcomeScreen';

interface AIChatPanelProps {
  title?: string;
  onClose?: () => void;
}

export default function AIChatPanel({ title = 'AI Assistant', onClose }: AIChatPanelProps) {
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
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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
    <div className="flex h-full min-h-0 flex-col bg-[#0d1117] text-gray-200 relative overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex flex-col p-3 border-b border-gray-800 bg-[#161b22]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSessions(true)}
              className="p-1.5 hover:bg-gray-700/50 rounded text-gray-400 hover:text-gray-200 transition-colors"
            >
              <Menu size={18} />
            </button>
            <span className="font-semibold text-sm">{title}</span>
          </div>
        </div>
        
        <ModelSelector />
        <ProfileSelector />
      </div>

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
      <div className="flex-shrink-0 p-4 bg-[#161b22] border-t border-gray-800">
        {activeTab && (
          <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md text-xs w-fit">
            <FileCode2 size={12} />
            <span className="truncate max-w-[200px]">{activeTab.fileName}</span>
          </div>
        )}
        
        <div className="relative flex items-end bg-[#0d1117] border border-gray-700 rounded-xl focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/50 transition-all shadow-sm">
          <button className="p-3 text-gray-500 hover:text-gray-300 transition-colors shrink-0">
            <Paperclip size={18} />
          </button>
          
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? "AI is typing..." : "Ask anything... (Shift+Enter for newline)"}
            className="w-full max-h-48 min-h-[44px] py-3 bg-transparent text-sm resize-none outline-none placeholder:text-gray-500 custom-scrollbar"
            rows={Math.min(5, Math.max(1, input.split('\n').length))}
            disabled={isStreaming}
          />
          
          <div className="p-2 shrink-0">
            {isStreaming ? (
              <button 
                onClick={cancelStream}
                className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                title="Stop Generating"
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button 
                onClick={handleSend}
                disabled={!input.trim()}
                className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
              >
                <ArrowUp size={16} strokeWidth={3} />
              </button>
            )}
          </div>
        </div>
        <div className="text-center mt-2 text-[10px] text-gray-500">
          AI can make mistakes. Verify critical code.
        </div>
      </div>

      {showSessions && <SessionList onClose={() => setShowSessions(false)} />}
    </div>
  );
}
