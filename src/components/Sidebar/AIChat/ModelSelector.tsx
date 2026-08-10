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
    <div className="relative z-10 w-full mb-2">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#1e2329] hover:bg-[#252b32] border border-gray-700/50 rounded-lg text-sm text-gray-200 transition-colors"
      >
        <div className="flex items-center gap-2">
          {selected && getProviderIcon(selected.provider)}
          <span className="font-medium">{selected ? selected.name : 'Select a Model'}</span>
        </div>
        <ChevronDown size={14} className="text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 w-full mt-1 bg-[#1e2329] border border-gray-700/50 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {providers.map(provider => (
            <div key={provider}>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-[#151b20]">
                {provider}
              </div>
              {availableModels.filter(m => m.provider === provider).map(model => (
                <button
                  key={model.id}
                  onClick={() => { setSelectedModel(model.id); setIsOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-[#252b32] transition-colors ${selectedModel === model.id ? 'bg-[#2a313a]' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    {getProviderIcon(provider)}
                    <span className={selectedModel === model.id ? 'text-blue-400 font-medium' : 'text-gray-300'}>
                      {model.name}
                    </span>
                  </div>
                  {selectedModel === model.id && <Check size={14} className="text-blue-400" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
