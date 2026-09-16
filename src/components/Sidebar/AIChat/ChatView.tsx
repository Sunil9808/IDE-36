import React, { useEffect, useRef, useState, useCallback } from "react";
import { RotateCcw, ChevronDown } from "lucide-react";
import { useAIChat } from "../../../hooks/useAIChat";
import { useAIStore } from "../../../store/aiStore";
import { MessageBubble } from "./MessageBubble";
import { AIChatInputBar } from "./AIChatInputBar";

/**
 * ChatView - the direct-chat mode of the AI panel.
 * Uses useAIChat for streaming + abort + retry.
 */
export const ChatView: React.FC = () => {
  const { messages, isStreaming, error, sendMessage, clearMessages, cancelStream, retryLastMessage } = useAIChat();
  const { availableModels, fetchModels } = useAIStore();
  const [input, setInput] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (availableModels.length === 0) {
      fetchModels();
    }
  }, []);

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

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    await sendMessage(text);
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
        {hasMessages ? (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center h-full text-center text-[var(--text-2)] p-4">
            <p className="text-sm">Start a conversation in Chat mode or switch to Cowork for agentic tasks.</p>
          </div>
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
        <AIChatInputBar
          value={input}
          onChange={setInput}
          onSend={handleSend}
          isStreamingOrRunning={isStreaming}
          onCancel={cancelStream}
          onFileSelect={handleFileSelect}
          hasMessages={hasMessages}
          onClearMessages={clearMessages}
          placeholder="Ask anything, @ to mention, / for commands"
        />
      </div>
    </div>
  );
};
