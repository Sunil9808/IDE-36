import React, { useState } from 'react';
import { Play, FileCode, CheckCircle, CircleDashed, Loader2, AlertTriangle, Check } from 'lucide-react';
import { useEditorStore } from '../../../store/editorStore';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { useFileStore } from '../../../store/fileStore';
import { fileService } from '../../../services/fileService';
import { useUIStore } from '../../../store/uiStore';

interface Action {
  type: string;
  path?: string;
  command?: string;
  content?: string;
}
interface AgentPanelProps {
  mode?: 'build' | 'agent';
}

export function AgentPanel({ mode = 'agent' }: AgentPanelProps) {
  const [task, setTask] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [plan, setPlan] = useState<any>(null);
  
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

  const handlePlan = async () => {
    if (!task.trim()) return;
    setIsPlanning(true);
    setPlan(null);
    setIsApplied(false);
    setApplyError(null);
    try {
      const activeTab = getActiveTab();
      const context = {
        currentFile: activeTab ? { path: activeTab.filePath, content: activeTab.content, language: activeTab.language, name: activeTab.fileName } : undefined,
        workspaceName: workspace?.name || 'my-project',
        workspacePath: workspace?.path,
        workspaceType: workspace?.type,
        fileTree: flattenTree(fileTree)
      };

      const fullTask = mode === 'build' ? `[BUILD MODE] Focus exclusively on creating and scaffolding files/folders. Do not modify existing files unless necessary. Task: ${task}` : task;

      const response = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: fullTask, context })
      });
      if (!response.ok) throw new Error('Agent failed');
      const data = await response.json();
      setPlan(data);
      
      if (workspace?.type !== 'local') {
        // Backend executed the files synchronously
        setIsApplied(true);
        window.dispatchEvent(new CustomEvent('ai-web-ide:workspace-changed'));
        setTask('');
      }
    } catch (e: any) {
      console.error(e);
      setApplyError(e.message || 'Failed to generate plan');
    } finally {
      setIsPlanning(false);
    }
  };

  const handleApply = async () => {
    if (!plan || !plan.actions || workspace?.type !== 'local') return;
    setIsApplying(true);
    setApplyError(null);
    try {
      const workspacePath = workspace.path;
      for (const action of plan.actions) {
        if (!action.success) continue; // Skip unsupported actions like runCommand locally
        const actionPath = (action.path || action.target || '').replace(/^[\\/]+/, '');
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
        }
      }
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
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {plan && (
          <div className="flex flex-col gap-4">
            {isApplied ? (
              <div className="bg-[var(--bg-2)] p-3 rounded-lg border border-[var(--border-0)] text-[var(--success)] font-medium text-sm flex items-center gap-2">
                <CheckCircle size={16} /> Task Applied Successfully
              </div>
            ) : (
              <div className="bg-[var(--bg-2)] p-3 rounded-lg border border-[var(--border-0)] text-[var(--warning)] font-medium text-sm flex items-center gap-2">
                <AlertTriangle size={16} /> Review Proposed Changes
              </div>
            )}
            
            <div className="bg-[var(--bg-2)] p-3 rounded-lg border border-[var(--border-0)]">
              <h3 className="font-semibold text-sm mb-2 text-[var(--text-1)]">Summary</h3>
              <p className="text-sm">{plan.summary}</p>
            </div>
            
            {plan.actions?.length > 0 && (
              <div className="bg-[var(--bg-2)] p-3 rounded-lg border border-[var(--border-0)]">
                <h3 className="font-semibold text-sm mb-2 text-[var(--text-1)]">{isApplied ? 'Actions Performed' : 'Planned Actions'}</h3>
                <div className="flex flex-col gap-2">
                  {plan.actions.map((a: Action, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm bg-[var(--bg-1)] p-2 rounded border border-[var(--border-0)]">
                      <FileCode size={16} className="mt-0.5 text-[var(--info)] shrink-0" />
                      <div>
                        <div className="font-medium">{a.type} {a.type === 'deleteFile' && <span className="text-xs text-[var(--error)] ml-2">(Destructive)</span>}</div>
                        <div className="text-[var(--text-1)] text-xs font-mono mt-1 break-all">{a.path || a.command || (a as any).oldPath + ' -> ' + (a as any).newPath}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isApplied && workspace?.type === 'local' && (
              <button
                onClick={handleApply}
                disabled={isApplying}
                className="w-full py-2 bg-[var(--success)] hover:brightness-110 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isApplying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {isApplying ? 'Applying...' : 'Confirm & Apply Changes'}
              </button>
            )}
          </div>
        )}
        
        {!plan && !isPlanning && (
          <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-[var(--text-1)] text-center px-4">
            <CircleDashed size={32} className="mb-3 opacity-20" />
            <p className="text-sm">The Agent can write files, run commands, and install packages autonomously.</p>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 mt-4 pt-4 border-t border-[var(--border-0)]">
        <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>
          {mode === 'build' ? 'Build Task' : 'Agent Task'}
        </label>
        <textarea
          className={`w-full bg-[var(--bg-2)] text-[var(--text-0)] p-3 rounded-lg border border-[var(--border-1)] focus:border-[var(--accent)] resize-none h-24 custom-scrollbar ${(!workspace || workspace.type !== 'local') ? 'opacity-50 cursor-not-allowed' : ''}`}
          placeholder={mode === 'build' ? "Describe the feature, files, or folder structure to build..." : "Describe a complex task for the AI to plan and execute (e.g. 'Create a React login component')"}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={!workspace || workspace.type !== 'local'}
        />
        {(!workspace || workspace.type !== 'local') ? (
          <div className="mt-3 p-3 text-sm text-[var(--warning)] bg-[#f59e0b1a] border border-[#f59e0b33] rounded-lg flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span className="break-words">Please open a folder from your local computer first to use the AI Pair.</span>
          </div>
        ) : (
          <button
            onClick={handlePlan}
            disabled={isPlanning || isApplying || !task.trim()}
            className="mt-3 w-full py-2 bg-[var(--accent)] hover:bg-[var(--accent-h)] text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {isPlanning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {isPlanning ? 'Generating Plan...' : 'Generate Plan'}
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
