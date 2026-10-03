import React from 'react';
import { User, Sparkles, Clock, Coins } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ChatMessage } from '../../../types/ai.types';
import { CodeBlock } from './CodeBlock';
import { useEditorStore } from '../../../store/editorStore';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { fileService } from '../../../services/fileService';
import { getLanguageFromExtension } from '../../../utils/fileHelpers';
import { useUIStore } from '../../../store/uiStore';
import { FileText } from 'lucide-react';

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const { openTab } = useEditorStore();
  const { workspace } = useWorkspaceStore();
  const { addNotification } = useUIStore();

  const handleFileClick = async (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    if (!workspace?.path) return;
    
    // Parse href, e.g. path/to/file.js#L10
    const [relPath, hash] = href.split('#');
    const lineStr = hash?.startsWith('L') ? hash.substring(1) : undefined;
    const line = lineStr ? parseInt(lineStr, 10) : 1;
    
    // Normalize path
    const filePath = relPath.startsWith('/') ? relPath : `${workspace.path}/${relPath}`;
    const fileName = relPath.split('/').pop() || 'Unknown';
    const language = getLanguageFromExtension(fileName);
    
    try {
      // Create a stable ID for the file
      const fileId = btoa(filePath).substring(0, 16);
      
      const fileContent = await fileService.readFile(filePath);
      
      openTab({
        id: `tab-${fileId}`,
        fileId: fileId,
        filePath: fileContent.path,
        fileName: fileName,
        language: fileContent.language,
        content: fileContent.content,
        isDirty: false,
        isPreview: false,
        cursorPosition: { line, column: 1 },
      });
    } catch (error) {
      addNotification({
        type: 'error',
        message: `Failed to open file: ${relPath}`
      });
    }
  };

  return (
    <div className={`flex flex-col mb-6 w-full animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      {isUser ? (
        <div className="flex w-full justify-end">
          <div className="max-w-[90%] p-3 border border-[var(--border-2)] bg-[var(--bg-2)] text-[var(--text-0)] rounded-xl rounded-tr-sm shadow-sm text-[13.5px] leading-relaxed">
            <ReactMarkdown
              components={{
                a({node, href, children, ...props}) {
                  if (href && (href.startsWith('/') || href.startsWith('./') || href.startsWith('src/') || href.includes('.'))) {
                    return (
                      <a 
                        href={href} 
                        onClick={(e) => handleFileClick(e, href)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-[var(--accent-dim)] hover:bg-blue-500/20 text-[var(--accent)] hover:text-blue-300 transition-colors no-underline cursor-pointer border border-blue-500/20"
                        title={`Open ${href}`}
                        {...props}
                      >
                        <FileText size={12} className="opacity-70" />
                        <span>{children}</span>
                      </a>
                    );
                  }
                  return <a href={href} className="text-[var(--accent)] hover:underline" target="_blank" rel="noreferrer" {...props}>{children}</a>;
                },
                code({node, inline, className, children, ...props}: any) {
                  return inline ? (
                    <code className="bg-[var(--bg-4)] rounded px-1.5 py-0.5 text-[var(--text-0)] font-mono text-[12px]" {...props}>
                      {children}
                    </code>
                  ) : <span className="font-mono">{children}</span>;
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="flex flex-col w-full">
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-[var(--text-1)] uppercase tracking-wider">
            <Sparkles size={14} className="text-[var(--accent)]" />
            <span>AI Pair</span>
          </div>
          <div className="w-full text-[var(--text-0)] text-[13.5px] leading-relaxed">
            <div className="prose prose-invert max-w-none break-words">
              <ReactMarkdown
                components={{
                  a({node, href, children, ...props}) {
                    if (href && (href.startsWith('/') || href.startsWith('./') || href.startsWith('src/') || href.includes('.'))) {
                      return (
                        <a 
                          href={href} 
                          onClick={(e) => handleFileClick(e, href)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-[var(--accent-dim)] hover:bg-blue-500/20 text-[var(--accent)] hover:text-blue-300 transition-colors no-underline cursor-pointer border border-blue-500/20"
                          title={`Open ${href}`}
                          {...props}
                        >
                          <FileText size={12} className="opacity-70" />
                          <span>{children}</span>
                        </a>
                      );
                    }
                    return <a href={href} className="text-[var(--accent)] hover:underline" target="_blank" rel="noreferrer" {...props}>{children}</a>;
                  },
                  code({node, inline, className, children, ...props}: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <CodeBlock language={match[1]} code={String(children).replace(/\n$/, '')} />
                    ) : !inline ? (
                      <CodeBlock language="text" code={String(children).replace(/\n$/, '')} />
                    ) : (
                      <code className="bg-[var(--bg-4)] rounded px-1.5 py-0.5 text-[var(--text-0)] font-mono text-[12px]" {...props}>
                        {children}
                      </code>
                    )
                  },
                  p({children}) { return <p className="mb-2 last:mb-0">{children}</p>; },
                  ul({children}) { return <ul className="list-disc pl-4 mb-2">{children}</ul>; },
                  ol({children}) { return <ol className="list-decimal pl-4 mb-2">{children}</ol>; },
                  li({children}) { return <li className="pl-1 mb-1 relative before:content-['✓'] before:absolute before:-left-4 before:text-[var(--success)]">{children}</li>; }
                }}
              >
                {message.content}
              </ReactMarkdown>
              {message.isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-[var(--accent)] animate-pulse align-middle" />
              )}
            </div>
          </div>
          
          {/* Metadata */}
          {!message.isStreaming && (message.latencyMs || message.tokenCount) && (
            <div className="flex items-center gap-3 mt-3 px-1 text-[10px] text-[var(--text-2)] font-mono">
              {message.latencyMs && (
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {(message.latencyMs / 1000).toFixed(1)}s
                </span>
              )}
              {message.tokenCount && (
                <span className="flex items-center gap-1">
                  <Coins size={10} />
                  {message.tokenCount.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
