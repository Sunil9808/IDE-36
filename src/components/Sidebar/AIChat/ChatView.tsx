import React, { useEffect, useRef, useState, useCallback } from "react";
import { Send, Square, RotateCcw, Trash2, ChevronDown, Sparkles } from "lucide-react";
import { useAIChat } from "../../../hooks/useAIChat";
import { useAIStore } from "../../../store/aiStore";
import { MessageBubble } from "./MessageBubble";
import { WelcomeScreen } from "./WelcomeScreen";
import { PlusMenu } from "./PlusMenu";
import { ModelSelector } from "./ModelSelector";

/**
 * ChatView - the direct-chat mode of the AI panel.
 * Uses useAIChat for streaming + abort + retry.
 * Fully self-contained; AgentPanel handles the agentic mode separately.
 */
export const ChatView: React.FC = () => {
  const { messages, isStreaming, error, sendMessage, clearMessages, cancelStream, retryLastMessage } = useAIChat();
  const { availableModels, fetchModels } = useAIStore();
  const [input, setInput] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFileSelect = (files: FileList) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        if (file.type.startsWith('image/')) {
          setInput((prev) => `${prev}\n![${file.name}](${content})`.trim());
        } else {
          setInput((prev) => `${prev}\n\`\`\`${file.name}\n${content.slice(0, 10000)}\n\`\`\``.trim());
        }
      };
      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  // Fetch models on first mount if not loaded
  useEffect(() => {
    if (availableModels.length === 0) {
      fetchModels();
    }
  }, []);

  // Auto-scroll to bottom on new messages unless user scrolled up
  useEffect(() => {
    if (!showScrollBtn) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showScrollBtn]);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 80);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollBtn(false);
  };

  // Auto-resize textarea up to 160px
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Message list */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2"
      >
        {hasMessages && (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && hasMessages && (
        <div className="flex justify-center pb-1">
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-1 px-3 py-1 text-xs bg-[var(--bg-2)] border border-[var(--border-0)] rounded-full text-[var(--text-2)] hover:text-[var(--text-0)] transition-colors shadow-md"
          >
            <ChevronDown size={12} /> Latest
          </button>
        </div>
      )}

      {/* Error banner with retry */}
      {error && (
        <div className="mx-3 mb-1 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-center justify-between">
          <span className="truncate">{error}</span>
          <button
            onClick={retryLastMessage}
            className="ml-2 flex items-center gap-1 text-red-400 hover:text-red-300 flex-shrink-0"
          >
            <RotateCcw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-[var(--border-0)] p-3">
        <div className="relative flex flex-col bg-[var(--bg-0)] border border-[var(--border-1)] rounded-xl focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent-dim)] transition-all shadow-sm">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything, @ to mention, / for commands"
            rows={2}
            disabled={isStreaming}
            className="w-full bg-transparent text-sm p-3 resize-none min-h-[60px] max-h-[160px] outline-none custom-scrollbar disabled:opacity-60 text-[var(--text-0)] placeholder-[var(--text-3)]"
          />

          <div className="flex items-center justify-between p-2 border-t border-[var(--border-0)]/40 bg-[var(--bg-1)]/30 rounded-b-xl">
            <div className="flex items-center gap-2">
              <PlusMenu onFileSelect={handleFileSelect} />
              <ModelSelector />
            </div>

            <div className="flex items-center gap-1">
              {hasMessages && (
                <button
                  onClick={clearMessages}
                  title="Clear conversation"
                  className="p-1.5 text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)] rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              )}
              {isStreaming ? (
                <button
                  onClick={cancelStream}
                  title="Stop generation"
                  className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                >
                  <Square size={15} />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  title="Send message (Enter)"
                  className="p-1.5 bg-[var(--accent)] hover:opacity-90 text-white rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
