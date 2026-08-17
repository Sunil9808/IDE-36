import React, { useState, useRef } from 'react';
import { Play, FileCode, CheckCircle, CircleDashed, Loader2, AlertTriangle, Check, Paperclip, Plus, Image, AtSign, Zap, Globe, MessageCircle, Edit2, Bug, Bot, ChevronUp } from 'lucide-react';

const modes = [
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'edit', label: 'Edit', icon: Edit2 },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'debug', label: 'Debug', icon: Bug },
] as const;
import { useEditorStore } from '../../../store/editorStore';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { useFileStore } from '../../../store/fileStore';
import { fileService } from '../../../services/fileService';
import { useUIStore } from '../../../store/uiStore';
import { ModelSelector } from './ModelSelector';

interface Action {
  type: string;
  path?: string;
  command?: string;
  content?: string;
}
interface AgentPanelProps {
  mode?: 'edit' | 'debug' | 'agent';
  onModeChange?: (mode: 'chat' | 'edit' | 'debug' | 'agent') => void;
}

export function AgentPanel({ mode = 'agent', onModeChange }: AgentPanelProps) {
  const [task, setTask] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [plan, setPlan] = useState<any>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [submittedTask, setSubmittedTask] = useState('');
  const [showActions, setShowActions] = useState(false);
  const [currentActionIndex, setCurrentActionIndex] = useState<number | null>(null);
  const [planningStep, setPlanningStep] = useState(0);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const [historyList, setHistoryList] = useState<{task: string, plan: any, isApplied: boolean}[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<{question: string, options: string[]} | null>(null);
  
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
  
  const { getActiveTab } = useEditorStore();
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
      if (mode === 'edit') {
        fullTask = `[EDIT MODE] Focus exclusively on modifying the currently active file or user selection based on the prompt. Do not scaffold new projects. Task: ${task}`;
      } else if (mode === 'debug') {
        fullTask = `[DEBUG MODE] You are an expert at finding and fixing problems.
Task: ${task}
Instructions:
1. Analyze the provided context, errors, and task to detect syntax or logical problems.
2. Trace the root cause across related files, APIs, or configurations.
3. Explain the problem clearly (What went wrong, why, and how it can be fixed).
4. Propose a precise fix with required code changes and affected files.
5. Do not make unrelated changes.`;
      } else {
        fullTask = `[AGENT MODE] You are a fully autonomous agent capable of handling anything from scaffolding complete projects (creating files, folders, APIs, generating entire features) to executing complex multi-step modifications. 
Task: ${task}
Instructions:
1. Plan the architecture and generate complete code for new features if asked to build.
2. Provide a detailed plan of files to create or modify.`;
      }

      const response = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          task: fullTask, 
          context, 
          provider: mode, 
          model: mode,
          conversationHistory 
        })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Backend Error (${response.status}): ${errText}`);
      }
      
      const data = await response.json();
      setPlan(data);
      
      if (workspace?.type !== 'local') {
        // Backend executed the files synchronously
        setIsApplied(true);
        window.dispatchEvent(new CustomEvent('ai-web-ide:workspace-changed'));
        setTask('');
      } else {
        // Automatically apply the plan
        await handleApply(data);
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
      for (let i = 0; i < planData.actions.length; i++) {
        const action = planData.actions[i];
        if (!action.success) continue;
        setCurrentActionIndex(i);
        
        let actionPath = (action.path || action.target || '').replace(/^[\\/]+/, '');
        if (actionPath.startsWith('./')) actionPath = actionPath.substring(2);
        if (!actionPath) continue;

        if (action.type === 'writeFile') {
          const absolutePath = `${workspacePath}/${actionPath}`;
          await fileService.writeFile(absolutePath, action.content || '');
        } else if (action.type === 'mkdir') {
          const absolutePath = `${workspacePath}/${actionPath}`;
          await fileService.createFolder(absolutePath);
        } else if (action.type === 'deleteFile') {
          const absolutePath = `${workspacePath}/${actionPath}`;
          await fileService.deleteFile(absolutePath);
        } else if (action.type === 'renameFile') {
          const absoluteOld = `${workspacePath}/${(action.oldPath || '').replace(/^[\\/]+/, '')}`;
          const absoluteNew = `${workspacePath}/${(action.newPath || '').replace(/^[\\/]+/, '')}`;
          await fileService.renameFile(absoluteOld, absoluteNew);
        } else if (action.type === 'appendFile') {
           const absolutePath = `${workspacePath}/${actionPath}`;
           try {
             const existing = await fileService.readFile(absolutePath);
             await fileService.writeFile(absolutePath, existing.content + (action.content || ''));
           } catch {
             await fileService.writeFile(absolutePath, action.content || '');
           }
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
        }
      }
      
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

        {isPlanning && (
          <div className="flex justify-start mb-6">
            <div className="bg-[var(--bg-1)] border border-[var(--border-0)] px-4 py-3 rounded-2xl rounded-tl-sm max-w-[85%] shadow-sm flex items-center gap-3 text-sm text-[var(--text-1)]">
              <Loader2 size={16} className="animate-spin text-[var(--accent)] shrink-0" />
              <span className="animate-pulse">{planningMessages[planningStep]}</span>
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
                        <span className="text-[var(--success)] flex items-center gap-1"><CheckCircle size={12}/> Applied</span>
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
                          <div key={i} className={`flex items-start gap-2 text-sm p-2 rounded-md transition-all ${isCurrent ? 'bg-[var(--bg-0)] border border-[var(--accent)] shadow-sm' : 'bg-transparent'}`}>
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
                              <div className="text-xs text-[var(--text-2)] font-mono truncate mt-0.5">
                                {a.path || a.target || a.command || (a.oldPath ? `${a.oldPath} -> ${a.newPath}` : '')}
                              </div>
                            </div>
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

      <div className="flex-shrink-0 mt-4 pt-4 border-t border-[var(--border-0)]">
        <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>
          {mode === 'edit' ? 'Edit Instructions' : mode === 'debug' ? 'Bug / Error Info' : 'Agent Task'}
        </label>
        <div className="relative flex flex-col bg-[var(--bg-0)] border border-[var(--border-1)] rounded-xl focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent-dim)] transition-all shadow-sm">
          <input type="file" ref={fileInputRef} onChange={handleFileAttach} className="hidden" />
          
          <textarea
            className={`w-full bg-transparent text-sm p-3 resize-none min-h-[80px] outline-none custom-scrollbar ${(!workspace || workspace.type !== 'local') ? 'opacity-50 cursor-not-allowed' : ''}`}
            placeholder={mode === 'edit' ? "Describe how to modify the current file or selected code..." : mode === 'debug' ? "Paste an error or describe a bug..." : "Describe a complex task to build or execute..."}
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
              
              <div className="relative shrink-0">
                <button 
                  onClick={() => setShowModeMenu(!showModeMenu)}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-[var(--text-1)] hover:text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-md transition-colors"
                  title="Switch Mode"
                >
                  {modes.find(m => m.id === mode)?.label || 'Agent'} <ChevronUp size={14} />
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
                            onClick={() => { onModeChange?.(m.id); setShowModeMenu(false); }}
                            className={`flex items-center gap-2 px-3 py-2.5 text-sm transition-colors w-full text-left ${mode === m.id ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-1)] hover:bg-[var(--bg-2)] hover:text-[var(--text-0)]'}`}
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
            
            {/* Right side placeholder if needed */}
            <div />
          </div>
        </div>
        {(!workspace || workspace.type !== 'local') ? (
          <div className="mt-3 p-3 text-sm text-[var(--warning)] bg-[#f59e0b1a] border border-[#f59e0b33] rounded-lg flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span className="break-words">Please open a folder from your local computer first to use the AI Pair.</span>
          </div>
        ) : (
          <button
            onClick={() => handlePlan(false)}
            disabled={isPlanning || isApplying || (!task.trim() && !pendingQuestion)}
            className="mt-3 w-full py-2 bg-[var(--accent)] hover:bg-[var(--accent-h)] text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {isPlanning || isApplying ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {isPlanning || isApplying ? 'Working...' : 'Run Task'}
          </button>
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
