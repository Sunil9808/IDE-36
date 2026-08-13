import React, { useState } from 'react';
import { Play, FileCode, CheckCircle, CircleDashed, Loader2 } from 'lucide-react';
import { useEditorStore } from '../../../store/editorStore';
import { useWorkspaceStore } from '../../../store/workspaceStore';

interface Action {
  type: string;
  path?: string;
  command?: string;
  content?: string;
}

export function AgentPanel() {
  const [task, setTask] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const { getActiveTab } = useEditorStore();
  const workspace = useWorkspaceStore((state) => state.workspace);

  const handlePlan = async () => {
    if (!task.trim()) return;
    setIsPlanning(true);
    setPlan(null); // clear previous plan
    try {
      const activeTab = getActiveTab();
      const context = {
        currentFile: activeTab ? { path: activeTab.filePath, content: activeTab.content, language: activeTab.language, name: activeTab.fileName } : undefined,
        workspaceName: workspace?.name || 'my-project',
        workspacePath: workspace?.path
      };

      const response = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, context })
      });
      if (!response.ok) throw new Error('Agent failed');
      const data = await response.json();
      setPlan(data);
      
      // The backend actually executes the files synchronously during the request.
      // Refresh the explorer so the new files appear immediately!
      window.dispatchEvent(new CustomEvent('ai-web-ide:workspace-changed'));
      
      // Clear the task input
      setTask('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsPlanning(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-4">
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>Agent Task</label>
        <textarea
          className="w-full bg-[var(--bg-2)] text-[var(--text-0)] p-3 rounded-lg border border-[var(--border-1)] focus:border-[var(--accent)] resize-none h-24 custom-scrollbar"
          placeholder="Describe a complex task for the AI to plan and execute (e.g. 'Create a React login component')"
          value={task}
          onChange={(e) => setTask(e.target.value)}
        />
        <button
          onClick={handlePlan}
          disabled={isPlanning || !task.trim()}
          className="mt-3 w-full py-2 bg-[var(--accent)] hover:bg-[var(--accent-h)] text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          {isPlanning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {isPlanning ? 'Executing Task...' : 'Execute Task'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {plan && (
          <div className="flex flex-col gap-4">
            <div className="bg-[var(--bg-2)] p-3 rounded-lg border border-[var(--border-0)] text-[var(--success)] font-medium text-sm flex items-center gap-2">
              <CheckCircle size={16} /> Task Executed Successfully
            </div>
            
            <div className="bg-[var(--bg-2)] p-3 rounded-lg border border-[var(--border-0)]">
              <h3 className="font-semibold text-sm mb-2 text-[var(--text-1)]">Summary</h3>
              <p className="text-sm">{plan.summary}</p>
            </div>
            
            {plan.actions?.length > 0 && (
              <div className="bg-[var(--bg-2)] p-3 rounded-lg border border-[var(--border-0)]">
                <h3 className="font-semibold text-sm mb-2 text-[var(--text-1)]">Actions Performed</h3>
                <div className="flex flex-col gap-2">
                  {plan.actions.map((a: Action, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm bg-[var(--bg-1)] p-2 rounded border border-[var(--border-0)]">
                      <FileCode size={16} className="mt-0.5 text-[var(--info)] shrink-0" />
                      <div>
                        <div className="font-medium">{a.type}</div>
                        <div className="text-[var(--text-1)] text-xs font-mono mt-1 break-all">{a.path || a.command}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {!plan && !isPlanning && (
          <div className="flex flex-col items-center justify-center h-40 text-[var(--text-1)] text-center px-4">
            <CircleDashed size={32} className="mb-3 opacity-20" />
            <p className="text-sm">The Agent can write files, run commands, and install packages autonomously.</p>
          </div>
        )}
      </div>
    </div>
  );
}
