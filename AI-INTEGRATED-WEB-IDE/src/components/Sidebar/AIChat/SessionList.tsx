import React from 'react';
import { useAIStore } from '../../../store/aiStore';
import { MessageSquare, Trash2, Plus } from 'lucide-react';

interface SessionListProps {
  onClose: () => void;
}

export const SessionList: React.FC<SessionListProps> = ({ onClose }) => {
  const { sessions, activeSessionId, loadSession, deleteSession, createSession } = useAIStore();

  return (
    <div className="absolute inset-0 bg-[#0d1117] z-20 flex flex-col animate-in slide-in-from-left-full duration-300 border-r border-gray-700/50">
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h3 className="font-semibold text-gray-200">Chat History</h3>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-gray-200"
        >
          Close
        </button>
      </div>
      
      <div className="p-3">
        <button
          onClick={() => { createSession(); onClose(); }}
          className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg transition-colors"
        >
          <Plus size={16} />
          <span>New Chat</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="text-center text-gray-500 text-sm mt-8">No previous sessions</div>
        ) : (
          sessions.map(session => (
            <div 
              key={session.id}
              className={`group flex items-center justify-between p-3 mb-2 rounded-lg cursor-pointer transition-colors ${
                activeSessionId === session.id ? 'bg-[#2a313a] border border-gray-600/50' : 'hover:bg-[#1e2329] border border-transparent'
              }`}
              onClick={() => { loadSession(session.id); onClose(); }}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare size={16} className={activeSessionId === session.id ? 'text-blue-400' : 'text-gray-500'} />
                <div className="truncate text-sm text-gray-300">{session.title}</div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-1 rounded hover:bg-gray-700"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
