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
    <div className="relative flex flex-col bg-[var(--bg-0)] border border-[var(--border-1)] rounded-2xl focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent-dim)] transition-all shadow-md w-full">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        disabled={disabled || isStreamingOrRunning}
        className="w-full bg-transparent text-sm p-3.5 resize-none min-h-[70px] max-h-[160px] outline-none custom-scrollbar disabled:opacity-60 text-[var(--text-0)] placeholder-[var(--text-3)]/60 rounded-t-2xl"
      />

      {/* Control Bar — Fixed padding ensuring Send button is 100% inside container border */}
      <div className="flex items-center justify-between gap-1 px-3 py-1.5 bg-[var(--bg-1)]/40 rounded-b-2xl w-full min-w-0">
        {/* Left Side: Plus Menu + Mode Switcher [ Chat | Cowork ] */}
        <div className="flex items-center gap-1 shrink-0">
          <PlusMenu onFileSelect={onFileSelect} />

          {/* Mode Pill Toggle */}
          <div className="flex bg-[var(--bg-2)] rounded-full p-0.5 border border-[var(--border-0)] shrink-0">
            <button
              type="button"
              onClick={() => setActiveMode('chat')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                activeMode === 'chat'
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-2)] hover:text-[var(--text-0)]'
              }`}
            >
              <MessageSquare size={11} />
              <span>Chat</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('work')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                activeMode === 'work'
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-2)] hover:text-[var(--text-0)]'
              }`}
            >
              <Briefcase size={11} />
              <span>Cowork</span>
            </button>
          </div>
        </div>

        {/* Right Side: ModelSelector + Bright Mic + Bright AudioLines + Clear + Send/Run */}
        <div className="flex items-center gap-1 shrink min-w-0 ml-auto">
          <ModelSelector />

          {/* Mic Button - Bright & Highlighted */}
          <button
            type="button"
            onClick={() => setIsRecording(!isRecording)}
            className={`p-1.5 rounded-lg transition-all shrink-0 ${
              isRecording
                ? 'text-red-400 bg-red-500/20 shadow-sm'
                : 'text-gray-200 hover:text-white hover:bg-[var(--hover)]'
            }`}
            title={isRecording ? "Stop recording" : "Voice input"}
          >
            <Mic size={14} className={isRecording ? 'text-red-400' : 'text-gray-300 hover:text-white'} />
          </button>

          {/* Audio Waveform / Live Button - Bright & Highlighted */}
          <button
            type="button"
            onClick={() => setIsAudioActive(!isAudioActive)}
            className={`p-1.5 rounded-lg transition-all shrink-0 ${
              isAudioActive
                ? 'text-[var(--accent)] bg-[var(--accent)]/20 shadow-sm'
                : 'text-gray-200 hover:text-white hover:bg-[var(--hover)]'
            }`}
            title="Live audio visualizer mode"
          >
            <AudioLines size={14} className={isAudioActive ? 'text-[var(--accent)]' : 'text-gray-300 hover:text-white'} />
          </button>

          {/* Clear messages button */}
          {hasMessages && onClearMessages && (
            <button
              type="button"
              onClick={onClearMessages}
              title="Clear conversation"
              className="p-1.5 text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--hover)] rounded-lg transition-colors shrink-0"
            >
              <Trash2 size={14} />
            </button>
          )}

          {/* Send / Run / Stop Button */}
          {isStreamingOrRunning ? (
            <button
              type="button"
              onClick={onCancel}
              title="Stop execution"
              className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors shrink-0"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!value.trim() || disabled}
              title={activeMode === 'work' ? "Run Task (Enter)" : "Send message (Enter)"}
              className="p-1.5 bg-[var(--accent)] hover:opacity-90 text-white rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {activeMode === 'work' ? <Play size={14} /> : <Send size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
