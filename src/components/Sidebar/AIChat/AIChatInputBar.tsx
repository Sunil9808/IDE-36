import React, { useRef, useState } from 'react';
import { Send, Square, Play, Mic, AudioLines, Trash2, MessageSquare, Briefcase } from 'lucide-react';
import { PlusMenu } from './PlusMenu';
import { ModelSelector } from './ModelSelector';
import { useAIStore } from '../../../store/aiStore';

interface AIChatInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isStreamingOrRunning: boolean;
  onCancel: () => void;
  onFileSelect: (files: FileList) => void;
  placeholder?: string;
  disabled?: boolean;
  hasMessages?: boolean;
  onClearMessages?: () => void;
}

export const AIChatInputBar: React.FC<AIChatInputBarProps> = ({
  value,
  onChange,
  onSend,
  isStreamingOrRunning,
  onCancel,
  onFileSelect,
  placeholder = "How can I help you today?",
  disabled = false,
  hasMessages = false,
  onClearMessages,
}) => {
  const { activeMode, setActiveMode } = useAIStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isStreamingOrRunning && !disabled) {
        onSend();
      }
    }
  };

  return (
    <div className="relative flex flex-col bg-[var(--bg-0)] border border-[var(--border-1)] rounded-2xl focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent-dim)] transition-all shadow-md overflow-hidden">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        disabled={disabled || isStreamingOrRunning}
        className="w-full bg-transparent text-sm p-3.5 resize-none min-h-[70px] max-h-[160px] outline-none custom-scrollbar disabled:opacity-60 text-[var(--text-0)] placeholder-[var(--text-3)]"
      />

      <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--border-0)]/40 bg-[var(--bg-1)]/40 rounded-b-2xl">
        {/* Left Side: Plus Menu + Mode Switcher [ Chat | Cowork ] */}
        <div className="flex items-center gap-2">
          <PlusMenu onFileSelect={onFileSelect} />

          {/* Mode Pill Toggle */}
          <div className="flex bg-[var(--bg-2)] rounded-full p-0.5 border border-[var(--border-0)]">
            <button
              type="button"
              onClick={() => setActiveMode('chat')}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-all ${
                activeMode === 'chat'
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-2)] hover:text-[var(--text-0)]'
              }`}
            >
              <MessageSquare size={12} />
              Chat
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('work')}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-all ${
                activeMode === 'work'
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-2)] hover:text-[var(--text-0)]'
              }`}
            >
              <Briefcase size={12} />
              Cowork
            </button>
          </div>
        </div>

        {/* Right Side: ModelSelector + Mic + AudioLines + Clear + Send/Run/Stop */}
        <div className="flex items-center gap-1.5">
          <ModelSelector />

          {/* Mic Button */}
          <button
            type="button"
            onClick={() => setIsRecording(!isRecording)}
            className={`p-1.5 rounded-lg text-[var(--text-2)] hover:text-[var(--text-0)] hover:bg-[var(--bg-2)] transition-colors ${
              isRecording ? 'text-red-400 bg-red-500/10' : ''
            }`}
            title={isRecording ? "Stop recording" : "Voice input"}
          >
            <Mic size={15} />
          </button>

          {/* Audio Waveform Button */}
          <button
            type="button"
            onClick={() => setIsAudioActive(!isAudioActive)}
            className={`p-1.5 rounded-lg text-[var(--text-2)] hover:text-[var(--text-0)] hover:bg-[var(--bg-2)] transition-colors ${
              isAudioActive ? 'text-[var(--accent)] bg-[var(--accent)]/10' : ''
            }`}
            title="Audio visualizer mode"
          >
            <AudioLines size={15} />
          </button>

          {/* Clear messages button */}
          {hasMessages && onClearMessages && (
            <button
              type="button"
              onClick={onClearMessages}
              title="Clear conversation"
              className="p-1.5 text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)] rounded-lg transition-colors"
            >
              <Trash2 size={15} />
            </button>
          )}

          {/* Send / Run / Stop Button */}
          {isStreamingOrRunning ? (
            <button
              type="button"
              onClick={onCancel}
              title="Stop execution"
              className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!value.trim() || disabled}
              title={activeMode === 'work' ? "Run Task (Enter)" : "Send message (Enter)"}
              className="p-1.5 bg-[var(--accent)] hover:opacity-90 text-white rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {activeMode === 'work' ? <Play size={15} /> : <Send size={15} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
