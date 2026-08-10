import React from 'react';
import { Sparkles, Terminal, Code, Bug, Lightbulb } from 'lucide-react';

interface WelcomeScreenProps {
  onActionSelect: (action: string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onActionSelect }) => {
  const suggestions = [
    { id: 'explain', icon: Lightbulb, title: 'Explain code', desc: 'Understand how this works', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    { id: 'debug', icon: Bug, title: 'Fix bug', desc: 'Find and fix issues', color: 'text-red-400', bg: 'bg-red-400/10' },
    { id: 'generate', icon: Code, title: 'Generate', desc: 'Write new features', color: 'text-green-400', bg: 'bg-green-400/10' },
    { id: 'refactor', icon: Terminal, title: 'Refactor', desc: 'Improve code quality', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center shadow-lg shadow-blue-500/20 mb-6">
        <Sparkles size={32} className="text-white" />
      </div>
      
      <h2 className="text-xl font-semibold text-gray-200 mb-2">How can I help you today?</h2>
      <p className="text-sm text-gray-400 mb-8 max-w-xs">
        I can explain code, find bugs, write tests, or generate entirely new features.
      </p>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {suggestions.map((item) => (
          <button
            key={item.id}
            onClick={() => onActionSelect(item.id)}
            className="flex flex-col items-start p-3 rounded-xl bg-[#1e2329] hover:bg-[#252b32] border border-gray-700/50 hover:border-gray-600 transition-all text-left group"
          >
            <div className={`p-2 rounded-lg ${item.bg} ${item.color} mb-2 group-hover:scale-110 transition-transform`}>
              <item.icon size={16} />
            </div>
            <span className="font-medium text-gray-200 text-sm mb-0.5">{item.title}</span>
            <span className="text-[10px] text-gray-500">{item.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
