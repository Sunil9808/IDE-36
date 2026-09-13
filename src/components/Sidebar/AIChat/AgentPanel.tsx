import React, { useState, useRef } from 'react';
import { Play, FileCode, CheckCircle, CircleDashed, Loader2, AlertTriangle, Check, Paperclip, Plus, Image, AtSign, Zap, Globe, MessageCircle, Edit2, Bug, Bot, ChevronUp, Sparkles } from 'lucide-react';

import { useEditorStore } from '../../../store/editorStore';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { useFileStore } from '../../../store/fileStore';
import { fileService } from '../../../services/fileService';
import { useUIStore } from '../../../store/uiStore';
import * as Diff from 'diff';
import { getLanguageFromExtension } from '../../../utils/fileHelpers';
// @ts-ignore
import { DiffEditor } from '@monaco-editor/react';
import { aiService } from '../../../services/aiService';
import { ModelSelector } from './ModelSelector';

interface Action {
  type: string;
  path?: string;
  command?: string;
  content?: string;
}
interface AgentPanelProps {}

function ChangeCard({ action, workspacePath }: { action: any, workspacePath: string }) {
  const [diffStats, setDiffStats] = useState<{added: number, removed: number} | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [oldContent, setOldContent] = useState<string>('');

  React.useEffect(() => {
    if (action.type !== 'writeFile' && action.type !== 'appendFile') return;
    const fetchOld = async () => {
      try {
        const absolutePath = `${workspacePath}/${(action.path || action.target || '').replace(/^[\\/]+/, '')}`;
        const file = await fileService.readFile(absolutePath);
        setOldContent(file.content);
        if (action.content) {
          const d = Diff.diffLines(file.content, action.type === 'appendFile' ? file.content + action.content : action.content);
          let added = 0; let removed = 0;
          d.forEach(part => { if (part.added) added += part.count || 0; if (part.removed) removed += part.count || 0; });
          setDiffStats({ added, removed });
        }
      } catch {
        // New file
        if (action.content) {
          const lines = action.content.split('\n').length;
          setDiffStats({ added: lines, removed: 0 });
        }
      }
    };
    fetchOld();
  }, [action, workspacePath]);

  return (
    <div className="mt-2 border border-[var(--border-0)] rounded-md overflow-hidden bg-[var(--bg-0)]">
      <div 
        className="flex items-center justify-between px-3 py-2 text-xs cursor-pointer hover:bg-[var(--bg-1)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <FileCode size={14} className="text-[var(--text-2)]" />
          <span className="font-mono text-[var(--text-1)]">{action.path || action.target}</span>
        </div>
        {diffStats && (
          <div className="flex items-center gap-3 font-mono text-[10px]">
            {diffStats.added > 0 && <span className="text-[var(--success)]">+{diffStats.added}</span>}
            {diffStats.removed > 0 && <span className="text-[var(--error)]">-{diffStats.removed}</span>}
            <span className="text-[var(--text-3)]">{expanded ? '▲' : '▼'}</span>
          </div>
        )}
      </div>
      {expanded && action.content && (
        <div className="h-[200px] border-t border-[var(--border-0)]">
          <DiffEditor
            original={oldContent}
            modified={action.type === 'appendFile' ? oldContent + action.content : action.content}
            language={action.path?.split('.').pop() || 'javascript'}
            theme="vs-dark"
            options={{ readOnly: true, minimap: { enabled: false }, renderSideBySide: false }}
          />
        </div>
      )}
    </div>
  );
}

export function AgentPanel({}: AgentPanelProps) {
  const [task, setTask] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [plan, setPlan] = useState<any>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [submittedTask, setSubmittedTask] = useState('');
  const [showActions, setShowActions] = useState(false);
  const [currentActionIndex, setCurrentActionIndex] = useState<number | null>(null);
  const [planningStep, setPlanningStep] = useState(0);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const [historyList, setHistoryList] = useState<{task: string, plan: any, isApplied: boolean}[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<{question: string, options: string[]} | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [runningTasks, setRunningTasks] = useState<{id: string, command: string}[]>([]);
  const [clarificationMessage, setClarificationMessage] = useState<string | null>(null);

  
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
        setTask(prev => prev ? `${prev}\n\n![${file.name}](${content})\n` : `![${file.name}](${content})\n`);
      } else {
        setTask(prev => prev ? `${prev}\n\nFile: ${file.name}\n\`\`\`\n${content}\n\`\`\`\n` : `File: ${file.name}\n\`\`\`\n${content}\n\`\`\`\n`);
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
  
  const { getActiveTab, openTab } = useEditorStore();
  const workspace = useWorkspaceStore((state) => state.workspace);
  const fileTree = useFileStore((state) => state.fileTree);
  const { addNotification } = useUIStore();

  const flattenTree = (nodes: any[]): string[] => {
    let list: string[] = [];
    for (const n of nodes) {
      list.push(n.path);
      if (n.children) list = list.concat(flattenTree(n.children));
    }
    return list;
  };

  
  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlanning) {
      setPlanningStep(0);
      interval = setInterval(() => {
        setPlanningStep(p => (p + 1) % 4);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isPlanning]);

  const planningMessages = [
    "Analyzing workspace context...",
    "Understanding requirements...",
    "Formulating execution plan...",
    "Drafting code..."
  ];

  const handlePlan = async (isFollowUp = false) => {
    if (!task.trim() && !isFollowUp) return;
    if (!isFollowUp) {
      if (submittedTask) {
        setHistoryList(prev => [...prev, { task: submittedTask, plan, isApplied }]);
        if (plan) {
          setConversationHistory(prev => [
            ...prev,
            { role: 'user', content: submittedTask },
            { role: 'assistant', content: JSON.stringify({ summary: plan.summary, plan: plan.plan, actions: plan.actions }) }
          ]);
        }
      }
      setSubmittedTask(task);
    }
    setIsPlanning(true);
    setPlan(null);
    setIsApplied(false);
    setApplyError(null);
    setShowActions(true); // Auto-expand to show live work
    setPendingQuestion(null);
    try {
      const activeTab = getActiveTab();
      const context = {
        currentFile: activeTab ? { path: activeTab.filePath, content: activeTab.content, language: activeTab.language, name: activeTab.fileName } : undefined,
        workspaceName: workspace?.name || 'my-project',
        workspacePath: workspace?.path,
        workspaceType: workspace?.type,
        fileTree: flattenTree(fileTree)
      };

      let fullTask = task;

      setEvents([]);
      setClarificationMessage(null);
      let finalData = null;

      await aiService.runAgentTask(fullTask, context, conversationHistory, (event: any) => {
        if (event.type === 'agent_result') {
          finalData = event.result;
          setPlan(event.result);
        } else if (event.type === 'clarification' || event.type === 'confirmation_required') {
          setClarificationMessage(event.message || 'Could you provide more details?');
        } else {
          setEvents(prev => {
            // Update existing tool event or add new
            if (event.type === 'tool_complete' || event.type === 'tool_error') {
              const existingIndex = prev.findIndex(e => e.tool === event.tool && e.target === event.target && e.type === 'tool_start');
              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = { ...updated[existingIndex], ...event };
                return updated;
              }
            }
            return [...prev, event];
          });
        }
      });

      
      if (finalData) {
        if (workspace?.type !== 'local') {
          // Backend executed the files synchronously
          setIsApplied(true);
          window.dispatchEvent(new CustomEvent('ai-web-ide:workspace-changed'));
          setTask('');
        } else {
          // Automatically apply the plan
          await handleApply(finalData);
        }
      }
    } catch (e: any) {
      console.error(e);
      let errorMsg = e.message || 'Failed to generate plan';
      if (errorMsg.includes('Failed to fetch')) {
        errorMsg = "API Connection Timeout! Your backend took too long to connect to the AI Provider (or the Dev Server proxy dropped the connection). Please check your .env API keys and network connection.";
      }
      setApplyError(errorMsg);
    } finally {
      setIsPlanning(false);
    }
  };

  const handleApply = async (planData = plan) => {
    if (!planData || !planData.actions || workspace?.type !== 'local') return;
    setIsApplying(true);
    setApplyError(null);
    try {
      const workspacePath = workspace.path;
      const readOutputs: string[] = [];
      const currentTransaction: any[] = [];

      for (let i = 0; i < planData.actions.length; i++) {
        const action = planData.actions[i];
        if (!action.success) continue;
        setCurrentActionIndex(i);
        
        let actionPath = (action.path || action.target || '').replace(/^[\\/]+/, '');
        if (actionPath.startsWith('./')) actionPath = actionPath.substring(2);
        if (!actionPath) continue;

          if (action.type === 'writeFile' || action.type === 'appendFile') {
            const absolutePath = `${workspacePath}/${actionPath}`;
            let oldContent = null;
            try {
              oldContent = (await fileService.readFile(absolutePath)).content;
            } catch { }
            currentTransaction.push({ path: actionPath, type: oldContent === null ? 'create' : 'modify', oldContent, newContent: action.content });
            await fileService.writeFile(absolutePath, action.type === 'appendFile' ? ((oldContent || '') + (action.content || '')) : (action.content || ''));
          } else if (action.type === 'createFile') {
            const absolutePath = `${workspacePath}/${actionPath}`;
            currentTransaction.push({ path: actionPath, type: 'create', oldContent: null, newContent: '' });
            await fileService.writeFile(absolutePath, '');
          } else if (action.type === 'mkdir') {
          const absolutePath = `${workspacePath}/${actionPath}`;
          currentTransaction.push({ path: actionPath, type: 'mkdir' });
          await fileService.createFolder(absolutePath);
        } else if (action.type === 'deleteFile') {
          const absolutePath = `${workspacePath}/${actionPath}`;
          let oldContent = null;
          try {
            oldContent = (await fileService.readFile(absolutePath)).content;
          } catch { }
          currentTransaction.push({ path: actionPath, type: 'delete', oldContent });
          await fileService.deleteFile(absolutePath);
        } else if (action.type === 'renameFile') {
          const absoluteOld = `${workspacePath}/${(action.oldPath || '').replace(/^[\\/]+/, '')}`;
          const absoluteNew = `${workspacePath}/${(action.newPath || '').replace(/^[\\/]+/, '')}`;
          currentTransaction.push({ path: action.oldPath, newPath: action.newPath, type: 'rename' });
          await fileService.renameFile(absoluteOld, absoluteNew);
        } else if (action.type === 'appendFile') {
           const absolutePath = `${workspacePath}/${actionPath}`;
           let oldContent = '';
           try {
             oldContent = (await fileService.readFile(absolutePath)).content;
           } catch { }
           currentTransaction.push({ path: actionPath, type: 'modify', oldContent, newContent: oldContent + (action.content || '') });
           await fileService.writeFile(absolutePath, oldContent + (action.content || ''));
        } else if (action.type === 'replaceText') {
           const absolutePath = `${workspacePath}/${actionPath}`;
           let oldContent = '';
           try {
             oldContent = (await fileService.readFile(absolutePath)).content;
           } catch { }
           const newContent = oldContent.replace(action.targetContent || '', action.content || '');
           currentTransaction.push({ path: actionPath, type: 'modify', oldContent, newContent });
           await fileService.writeFile(absolutePath, newContent);
           action.type = 'writeFile'; // So ChangeCard renders it correctly
           action.content = newContent;
        } else if (action.type === 'askQuestion') {
          // Pause execution and ask the user
          setPendingQuestion({
            question: action.question,
            options: action.options
          });
          setIsApplying(false);
          return; // Halt apply loop
        } else if (action.type === 'readFile') {
           const absolutePath = `${workspacePath}/${actionPath}`;
           try {
             const file = await fileService.readFile(absolutePath);
             readOutputs.push(`File: ${actionPath}\n\`\`\`\n${file.content.slice(0, 10000)}\n\`\`\``);
           } catch {
             readOutputs.push(`File: ${actionPath}\nError: File not found or could not be read.`);
           }
        } else if (action.type === 'listFiles') {
           try {
             // Basic implementation: just use the flat list of all files in workspace
             const allPaths = flattenTree(fileTree);
             const matched = allPaths.filter(p => p.startsWith(actionPath === '.' || actionPath === '' ? '' : actionPath));
             readOutputs.push(`Directory: ${actionPath || '.'}\nFiles:\n${matched.join('\n') || '(empty or not found)'}`);
           } catch {
             readOutputs.push(`Directory: ${actionPath}\nError: Could not list files.`);
           }
         } else if (action.type === 'runCommand') {
           // Emulate starting a background task
           setRunningTasks(prev => [...prev, { id: Date.now().toString(), command: action.command }]);
         }
      }
      
      setTransactions(prev => [...prev, { id: Date.now(), plan: planData, changes: currentTransaction }]);

      if (readOutputs.length > 0) {
        const toolOutputStr = readOutputs.join('\n\n');
        const newHistory = [
          ...conversationHistory,
          { role: 'assistant', content: JSON.stringify({ type: 'toolCalls', summary: planData.summary, plan: planData.plan, actions: planData.actions }) },
          { role: 'user', content: `Tool Outputs:\n${toolOutputStr}\n\nContinue with your ReAct loop. Remember to NOT guess file contents.` }
        ];
        setConversationHistory(newHistory);
        handlePlan(true); // Loop back to the agent!
        return;
      }

      setCurrentActionIndex(null);
      setIsApplied(true);
      window.dispatchEvent(new CustomEvent('ai-web-ide:workspace-changed'));
      addNotification({ type: 'success', message: 'Agent actions applied successfully!' });
      setTask('');
    } catch (e: any) {
      console.error(e);
      setApplyError(e.message || 'Failed to apply actions locally');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-4">
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col pt-2 pb-4">
        
        {!plan && !isPlanning && !submittedTask && historyList.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-[var(--text-1)] text-center px-4">
            <CircleDashed size={32} className="mb-3 opacity-20" />
            <p className="text-sm">The Agent can write files, run commands, and install packages autonomously.</p>
          </div>
        )}

        {historyList.map((hist, idx) => (
          <div key={idx} className="mb-6">
            <div className="flex justify-end mb-6">
              <div className="bg-[var(--accent)] text-white px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[85%] text-sm shadow-sm whitespace-pre-wrap">
                {hist.task}
              </div>
            </div>
            {hist.plan && (
              <div className="flex justify-start mb-6">
                <div className="bg-[var(--bg-1)] border border-[var(--border-0)] px-4 py-3 rounded-2xl rounded-tl-sm max-w-[95%] w-full shadow-sm opacity-80">
                  <p className="text-sm text-[var(--text-0)] whitespace-pre-wrap mb-3 leading-relaxed">
                    {hist.plan.summary}
                  </p>
                  {hist.plan.plan?.length > 0 && (
                    <div className="border border-[var(--border-0)] rounded-lg overflow-hidden bg-[var(--bg-0)] mt-2">
                      <div className="px-3 py-2 text-xs flex justify-between items-center text-[var(--text-1)] opacity-70">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{hist.plan.actions?.length || 0} files changed</span>
                          {hist.isApplied && <span className="text-[var(--success)] flex items-center gap-1"><CheckCircle size={12}/> Applied</span>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {submittedTask && (
          <div className="flex justify-end mb-6">
            <div className="bg-[var(--accent)] text-white px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[85%] text-sm shadow-sm whitespace-pre-wrap">
              {submittedTask}
            </div>
          </div>
        )}

        {events.length > 0 && (
          <div className="flex justify-start mb-6">
            <div className="bg-[var(--bg-1)] border border-[var(--border-0)] p-4 rounded-2xl rounded-tl-sm w-full shadow-sm">
              <h4 className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3">Live Execution</h4>
              <div className="flex flex-col gap-3">
                {events.map((ev, idx) => {
                  if (ev.type === 'tool_start' || ev.type === 'tool_complete' || ev.type === 'tool_error') {
                    const isDone = ev.type === 'tool_complete';
                    const isError = ev.type === 'tool_error';
                    const isCurrent = ev.type === 'tool_start';
                    // De-duplicate: only show the latest state of a tool/target combination
                    // Actually, we already updated them in place in the state array above
                    return (
                      <div key={idx} className={`flex items-start gap-2 text-sm transition-all ${isCurrent ? 'opacity-100' : 'opacity-70'}`}>
                        {isCurrent ? (
                          <Loader2 size={16} className="mt-0.5 text-[var(--accent)] shrink-0 animate-spin" />
                        ) : isError ? (
                          <AlertTriangle size={16} className="mt-0.5 text-[var(--error)] shrink-0" />
                        ) : (
                          <CheckCircle size={16} className="mt-0.5 text-[var(--success)] shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium ${isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-1)]'}`}>
                            {ev.message || (isDone ? `Completed ${ev.target}` : `Working on ${ev.target}...`)}
                          </div>
                          {isError && ev.error && <div className="text-xs text-[var(--error)] mt-1">{ev.error}</div>}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          </div>
        )}
        
        {isPlanning && events.length === 0 && (

          <div className="flex justify-start mb-6">
            <div className="bg-[var(--bg-1)] border border-[var(--border-0)] px-4 py-3 rounded-2xl rounded-tl-sm max-w-[85%] shadow-sm flex items-center gap-3 text-sm text-[var(--text-1)]">
              <Loader2 size={16} className="animate-spin text-[var(--accent)] shrink-0" />
              <span className="animate-pulse">{planningMessages[planningStep]}</span>
            </div>
          </div>
        )}

        {/* Clarification / confirmation response from the agent */}
        {clarificationMessage && !isPlanning && !plan && (
          <div className="flex justify-start mb-6">
            <div className="bg-[var(--bg-1)] border border-[var(--border-0)] px-4 py-3 rounded-2xl rounded-tl-sm max-w-[95%] shadow-sm flex items-start gap-3">
              <Bot size={16} className="mt-0.5 text-[var(--accent)] shrink-0" />
              <p className="text-sm text-[var(--text-0)] whitespace-pre-wrap leading-relaxed">{clarificationMessage}</p>
            </div>
          </div>
        )}

        {plan && !isPlanning && (

          <div className="flex justify-start mb-6">
            <div className="bg-[var(--bg-1)] border border-[var(--border-0)] px-4 py-3 rounded-2xl rounded-tl-sm max-w-[95%] w-full shadow-sm">
              <p className="text-sm text-[var(--text-0)] whitespace-pre-wrap mb-3 leading-relaxed">
                {plan.summary}
              </p>
              
              {plan.plan?.length > 0 && (
                <div className="border border-[var(--border-0)] rounded-lg overflow-hidden bg-[var(--bg-0)] mt-2">
                  <div 
                    className="px-3 py-2 text-xs flex justify-between items-center cursor-pointer hover:bg-[var(--bg-2)] transition-colors select-none text-[var(--text-1)]"
                    onClick={() => setShowActions(!showActions)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{plan.actions?.length || 0} files changed</span>
                      {isApplied ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--success)] flex items-center gap-1"><CheckCircle size={12}/> Applied</span>
                          {transactions.length > 0 && transactions[transactions.length - 1].plan === plan && (
                            <button 
                              onClick={async (e) => {
                                e.stopPropagation();
                                const lastTx = transactions[transactions.length - 1];
                                if (!lastTx) return;
                                try {
                                  // Revert changes in reverse order
                                  for (let i = lastTx.changes.length - 1; i >= 0; i--) {
                                    const change = lastTx.changes[i];
                                    const absolutePath = `${workspace?.path}/${change.path}`;
                                    if (change.type === 'create' || change.type === 'mkdir') {
                                      await fileService.deleteFile(absolutePath);
                                    } else if (change.type === 'modify' || change.type === 'delete') {
                                      await fileService.writeFile(absolutePath, change.oldContent || '');
                                    } else if (change.type === 'rename') {
                                      await fileService.renameFile(`${workspace?.path}/${change.newPath}`, `${workspace?.path}/${change.path}`);
                                    }
                                  }
                                  setTransactions(prev => prev.slice(0, -1));
                                  addNotification({ message: 'Changes reverted successfully', type: 'success' });
                                  window.dispatchEvent(new CustomEvent('ai-web-ide:workspace-changed'));
                                } catch (err) {
                                  addNotification({ message: 'Failed to revert some changes', type: 'error' });
                                }
                              }}
                              className="text-[var(--accent)] hover:underline ml-2"
                            >
                              Undo
                            </button>
                          )}
                        </div>
                      ) : isApplying ? (
                        <span className="text-[var(--accent)] flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Working...</span>
                      ) : null}
                      <span className="ml-1 opacity-50">{showActions ? '▼' : '▶'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="bg-[var(--bg-1)] border border-[var(--border-0)] px-2 py-0.5 rounded shadow-sm text-xs hover:bg-[var(--bg-2)] flex items-center gap-1 text-[var(--text-0)] transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Review
                      </button>
                    </div>
                  </div>
                  
                  {showActions && (
                    <div className="p-3 border-t border-[var(--border-0)] flex flex-col gap-2 bg-[var(--bg-1)]/50 max-h-[300px] overflow-y-auto custom-scrollbar">
                      <h4 className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-1">Live Changes</h4>
                      {plan.actions.map((a: any, i: number) => {
                        const isCurrent = currentActionIndex === i && isApplying;
                        const isDone = (currentActionIndex !== null && i < currentActionIndex) || isApplied;
                        
                        return (
                          <div key={i} className={`flex flex-col text-sm p-2 rounded-md transition-all ${isCurrent ? 'bg-[var(--bg-0)] border border-[var(--accent)] shadow-sm' : 'bg-transparent'}`}>
                            <div className="flex items-start gap-2">
                              {isCurrent ? (
                                <Loader2 size={14} className="mt-0.5 text-[var(--accent)] shrink-0 animate-spin" />
                              ) : isDone ? (
                                <CheckCircle size={14} className="mt-0.5 text-[var(--success)] shrink-0" />
                              ) : (
                                <CircleDashed size={14} className="mt-0.5 text-[var(--text-3)] shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className={`font-medium ${isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-1)]'}`}>
                                  {a.type} {a.type === 'deleteFile' && <span className="text-[var(--error)] text-xs ml-1">(Delete)</span>}
                                </div>
                                  <div 
                                    className={`text-xs font-mono truncate mt-0.5 ${(a.path || a.target || a.oldPath) ? 'text-[var(--accent)] hover:underline cursor-pointer' : 'text-[var(--text-2)]'}`}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const p = a.path || a.target || a.oldPath;
                                      if (!p || !workspace?.path) return;
                                      const absolutePath = `${workspace.path}/${p.replace(/^[\\/]+/, '')}`;
                                      try {
                                        const fileContent = await fileService.readFile(absolutePath);
                                        const fileId = btoa(absolutePath).substring(0, 16);
                                        openTab({
                                          id: `tab-${fileId}`,
                                          fileId,
                                          filePath: fileContent.path,
                                          fileName: p.split('/').pop() || p,
                                          language: getLanguageFromExtension(p),
                                          content: fileContent.content,
                                          isDirty: false,
                                          isPreview: false,
                                          cursorPosition: { line: 1, column: 1 },
                                        });
                                      } catch (err) {
                                        addNotification({ type: 'error', message: 'Could not open file (it might have been deleted)' });
                                      }
                                    }}
                                  >
                                    {a.path || a.target || a.command || (a.oldPath ? `${a.oldPath} -> ${a.newPath}` : '')}
                                  </div>
                              </div>
                            </div>
                            {isDone && (a.type === 'writeFile' || a.type === 'appendFile') && workspace?.path && (
                              <ChangeCard action={a} workspacePath={workspace.path} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {pendingQuestion && (
          <div className="flex justify-start mb-6">
            <div className="bg-[var(--bg-0)] border border-[var(--accent)] px-4 py-4 rounded-2xl rounded-tl-sm max-w-[95%] w-full shadow-md animate-in fade-in slide-in-from-bottom-2">
              <h3 className="text-[var(--accent)] font-semibold mb-3 flex items-center gap-2">
                <MessageCircle size={16} /> Clarification Needed
              </h3>
              <p className="text-sm text-[var(--text-0)] mb-4">{pendingQuestion.question}</p>
              <div className="flex flex-col gap-1.5 mt-2">
                {pendingQuestion.options.map((opt: string, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => {
                      const newHistory = [
                        ...conversationHistory,
                        { role: 'assistant', content: JSON.stringify({ type: 'askQuestion', question: pendingQuestion.question, options: pendingQuestion.options }) },
                        { role: 'user', content: `I choose: ${opt}` }
                      ];
                      setConversationHistory(newHistory);
                      setPendingQuestion(null);
                      handlePlan(true); // true = isFollowUp
                    }}
                    className="group flex items-center gap-3 px-3 py-2.5 bg-[var(--bg-1)] border border-[var(--border-0)] hover:bg-[var(--bg-2)] text-[var(--text-1)] hover:text-[var(--text-0)] rounded-lg text-sm text-left transition-all duration-200"
                  >
                    <div className="flex items-center justify-center w-6 h-6 rounded bg-[var(--bg-2)] group-hover:bg-[var(--bg-3)] text-xs font-medium shrink-0 opacity-70 group-hover:opacity-100">
                      {idx + 1}
                    </div>
                    <span className="flex-1 leading-snug">{opt}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {runningTasks.length > 0 && (
        <div className="flex-shrink-0 mb-3 px-1">
          <div className="bg-[var(--bg-0)] border border-[var(--border-1)] rounded-xl overflow-hidden shadow-sm transition-all">
            <button 
              className="w-full flex items-center justify-between p-3 text-sm font-medium text-[var(--text-1)] hover:bg-[var(--bg-2)] transition-colors"
              onClick={() => {}}
            >
              <span>{runningTasks.length} task{runningTasks.length > 1 ? 's' : ''} running</span>
              <ChevronUp size={16} className="text-[var(--text-2)]" />
            </button>
            <div className="border-t border-[var(--border-0)] p-2">
              {runningTasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--bg-1)] group">
                  <Loader2 size={14} className="text-[var(--accent)] animate-spin shrink-0" />
                  <span className="font-mono text-xs text-[var(--text-0)] flex-1 truncate">{task.command}</span>
                  <button 
                    onClick={() => setRunningTasks(prev => prev.filter(t => t.id !== task.id))}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--bg-2)] rounded text-[var(--error)] transition-all"
                    title="Kill task"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-shrink-0 mt-2 pt-4 border-t border-[var(--border-0)]">
        <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>
          AI Pair
        </label>
        <div className="relative flex flex-col bg-[var(--bg-0)] border border-[var(--border-1)] rounded-xl focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent-dim)] transition-all shadow-sm">
          <input type="file" ref={fileInputRef} onChange={handleFileAttach} className="hidden" />
          
          <textarea
            className={`w-full bg-transparent text-sm p-3 resize-none min-h-[80px] outline-none custom-scrollbar ${(!workspace || workspace.type !== 'local') ? 'opacity-50 cursor-not-allowed' : ''}`}
            placeholder="Ask anything or tell me what you want to build or change..."
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (task.trim() && !isPlanning && !isApplying) {
                  handlePlan(false);
                }
              }
            }}
            disabled={!workspace || workspace.type !== 'local'}
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
              
            </div>
            
            {/* Right side Generate button */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--text-2)] hidden xl:inline-block font-mono">⌘ Enter</span>
              <button
                onClick={() => handlePlan(false)}
                disabled={isPlanning || isApplying || (!task.trim() && !pendingQuestion) || (!workspace || workspace.type !== 'local')}
                className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-h)] text-white text-xs rounded-md font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
              >
                {isPlanning || isApplying ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {isPlanning || isApplying ? 'Working...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
        {(!workspace || workspace.type !== 'local') && (
          <div className="mt-3 p-3 text-sm text-[var(--warning)] bg-[#f59e0b1a] border border-[#f59e0b33] rounded-lg flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span className="break-words">Please open a local folder to use the AI Pair.</span>
          </div>
        )}
        {applyError && (
          <div className="mt-3 p-3 text-sm text-[var(--error)] bg-[#dc26261a] border border-[#dc262633] rounded-lg flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span className="break-words">{applyError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
