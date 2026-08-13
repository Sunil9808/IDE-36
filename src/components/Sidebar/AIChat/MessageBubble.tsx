import React from 'react';
import { User, Sparkles, Clock, Coins } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ChatMessage } from '../../../types/ai.types';
import { CodeBlock } from './CodeBlock';

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex flex-col mb-4 ${isUser ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`flex max-w-[95%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full shadow-sm border ${isUser ? 'bg-blue-600/20 border-blue-500/30 text-blue-400' : 'bg-[#22a6f2]/20 border-[#22a6f2]/30 text-[#22a6f2]'}`}>
          {isUser ? <User size={16} /> : <Sparkles size={16} />}
        </div>
        
        {/* Content */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} min-w-0 flex-1 overflow-hidden`}>
          <div className={`w-full p-3 rounded-2xl ${isUser ? 'bg-[#2a313a] text-gray-200 rounded-tr-sm' : 'bg-transparent text-gray-300'}`}>
            <div className="prose prose-invert max-w-none text-[13.5px] leading-relaxed break-words">
              <ReactMarkdown
                components={{
                  code({node, inline, className, children, ...props}: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    // Use custom CodeBlock for block code, standard code tag for inline
                    return !inline && match ? (
                      <CodeBlock language={match[1]} code={String(children).replace(/\n$/, '')} />
                    ) : !inline ? (
                      <CodeBlock language="text" code={String(children).replace(/\n$/, '')} />
                    ) : (
                      <code className="bg-gray-800 rounded px-1.5 py-0.5 text-[#e2e8f0] font-mono text-[12px]" {...props}>
                        {children}
                      </code>
                    )
                  },
                  p({children}) {
                    return <p className="mb-2 last:mb-0">{children}</p>
                  },
                  ul({children}) {
                    return <ul className="list-disc pl-4 mb-2">{children}</ul>
                  },
                  ol({children}) {
                    return <ol className="list-decimal pl-4 mb-2">{children}</ol>
                  }
                }}
              >
                {message.content}
              </ReactMarkdown>
              {message.isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-[#47d6b6] animate-pulse align-middle" />
              )}
            </div>
          </div>
          
          {/* Metadata */}
          {!isUser && !message.isStreaming && (message.latencyMs || message.tokenCount) && (
            <div className="flex items-center gap-3 mt-1.5 px-2 text-[10px] text-gray-500">
              {message.modelUsed && <span>{message.modelUsed}</span>}
              {message.latencyMs && (
                <span className="flex items-center gap-1">
                  <Clock size={10} /> {(message.latencyMs / 1000).toFixed(1)}s
                </span>
              )}
              {message.tokenCount && (
                <span className="flex items-center gap-1">
                  <Coins size={10} /> {message.tokenCount} tokens
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
