import React, { useState } from 'react';
import { useAIStore } from '../../../store/aiStore';
import { ChevronDown, Check, Zap, Server, Shield } from 'lucide-react';

export const ModelSelector: React.FC = () => {
  const { availableModels, selectedModel, setSelectedModel } = useAIStore();
  const [isOpen, setIsOpen] = useState(false);

  const selected = availableModels.find(m => m.id === selectedModel);

  const providers = Array.from(new Set(availableModels.map(m => m.provider)));
  
  const getProviderIcon = (provider: string) => {
    switch(provider) {
      case 'openai': return <Zap size={14} className="text-[#10a37f]" />;
      case 'anthropic': return <Zap size={14} className="text-[#d97706]" />;
      case 'gemini': return <Zap size={14} className="text-[#4285f4]" />;
      case 'local': return <Server size={14} className="text-gray-400" />;
      default: return <Shield size={14} className="text-gray-400" />;
    }
  };

  return (
    <div className="relative shrink-0">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-[var(--text-1)] hover:text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-md transition-colors"
        title="Switch Model"
      >
        <span className="font-medium truncate max-w-[120px]">
          {selected ? selected.name : 'Select Model'}
        </span>
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 w-48 bg-[var(--bg-1)] border border-[var(--border-0)] rounded-lg shadow-lg overflow-hidden flex flex-col z-50 animate-in fade-in zoom-in-95 duration-200 max-h-60 overflow-y-auto custom-scrollbar">
          {providers.map(provider => (
            <div key={provider}>
              <div className="px-3 py-2 text-xs font-semibold text-[var(--text-2)] border-b border-[var(--border-0)] bg-[var(--bg-2)]/50 uppercase tracking-wider">
                {provider}
              </div>
              {availableModels.filter(m => m.provider === provider).map(model => (
                <button
                  key={model.id}
                  onClick={() => { setSelectedModel(model.id); setIsOpen(false); }}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 text-sm transition-colors w-full text-left ${selectedModel === model.id ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-1)] hover:bg-[var(--bg-2)] hover:text-[var(--text-0)]'}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {getProviderIcon(provider)}
                    <span className="truncate">
                      {model.name}
                    </span>
                  </div>
                  {selectedModel === model.id && <Check size={14} />}
                </button>
              ))}
            </div>
          ))}
          </div>
        </>
      )}
    </div>
  );
};
