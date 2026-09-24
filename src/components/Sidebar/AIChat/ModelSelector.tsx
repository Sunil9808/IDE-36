import React, { useState, useRef, useEffect } from 'react';
import { useAIStore } from '../../../store/aiStore';
import { ChevronDown, Check, Search, Settings, Sparkles, Zap, Brain, Wrench, Server } from 'lucide-react';

export interface RichModelOption {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'deepseek' | 'meta';
  providerLabel: string;
  category: 'recommended' | 'powerful' | 'local';
  categoryLabel: string;
  contextWindow: string;
  badges: Array<'fast' | 'smart' | 'tools'>;
  description?: string;
}

export const DEFAULT_MODELS: RichModelOption[] = [
  // Recommended / Fast
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    providerLabel: 'OpenAI',
    category: 'recommended',
    categoryLabel: 'Recommended / Fast',
    contextWindow: '128k',
    badges: ['fast', 'tools'],
    description: 'Fast, lightweight model for everyday tasks'
  },
  {
    id: 'claude-3-5-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    providerLabel: 'Anthropic',
    category: 'recommended',
    categoryLabel: 'Recommended / Fast',
    contextWindow: '200k',
    badges: ['fast', 'smart'],
    description: 'Ultra-fast intelligence for quick coding & chat'
  },
  {
    id: 'gemini-1-5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'gemini',
    providerLabel: 'Google',
    category: 'recommended',
    categoryLabel: 'Recommended / Fast',
    contextWindow: '1M',
    badges: ['fast', 'tools'],
    description: 'Lightweight model with massive 1M context'
  },

  // Powerful / Reasoning
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    providerLabel: 'Anthropic',
    category: 'powerful',
    categoryLabel: 'Powerful / Reasoning',
    contextWindow: '200k',
    badges: ['smart', 'tools'],
    description: 'Industry leading model for complex coding & agentic tasks'
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    providerLabel: 'OpenAI',
    category: 'powerful',
    categoryLabel: 'Powerful / Reasoning',
    contextWindow: '128k',
    badges: ['smart', 'tools'],
    description: 'High-intelligence flagship multimodal model'
  },
  {
    id: 'o1-preview',
    name: 'O1 Preview',
    provider: 'openai',
    providerLabel: 'OpenAI',
    category: 'powerful',
    categoryLabel: 'Powerful / Reasoning',
    contextWindow: '128k',
    badges: ['smart'],
    description: 'Advanced reasoning model for complex math & logic'
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    providerLabel: 'DeepSeek',
    category: 'powerful',
    categoryLabel: 'Powerful / Reasoning',
    contextWindow: '64k',
    badges: ['smart'],
    description: 'Open reasoning model with chain-of-thought'
  },

  // Local / Ollama
  {
    id: 'qwen-2-5-coder',
    name: 'Qwen 2.5 Coder',
    provider: 'ollama',
    providerLabel: 'Ollama',
    category: 'local',
    categoryLabel: 'Local / Ollama',
    contextWindow: '32k',
    badges: ['fast', 'tools'],
    description: 'Local code assistant running via Ollama'
  },
  {
    id: 'llama-3-3',
    name: 'Llama 3.3',
    provider: 'meta',
    providerLabel: 'Meta',
    category: 'local',
    categoryLabel: 'Local / Ollama',
    contextWindow: '128k',
    badges: ['smart', 'tools'],
    description: 'Open-weight 70B model for local inference'
  },
  {
    id: 'deepseek-r1-local',
    name: 'DeepSeek R1 (Local)',
    provider: 'ollama',
    providerLabel: 'Ollama',
    category: 'local',
    categoryLabel: 'Local / Ollama',
    contextWindow: '32k',
    badges: ['smart'],
    description: 'Local DeepSeek R1 reasoning model'
  }
];

export const ModelSelector: React.FC = () => {
  const { selectedModel, setSelectedModel, availableModels } = useAIStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Merge dynamic available models if provided, otherwise default list
  const modelsList: RichModelOption[] = DEFAULT_MODELS;

  // Selected model info fallback
  const currentSelectedId = selectedModel || 'gpt-4o-mini';
  const selected = modelsList.find(m => m.id === currentSelectedId) || modelsList[0];

  // Filter models
  const filteredModels = modelsList.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.providerLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories: Array<{ id: 'recommended' | 'powerful' | 'local'; label: string }> = [
    { id: 'recommended', label: 'Recommended / Fast' },
    { id: 'powerful', label: 'Powerful / Reasoning' },
    { id: 'local', label: 'Local / Ollama' },
  ];

  const getProviderBadgeStyle = (provider: string) => {
    switch (provider) {
      case 'openai': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'anthropic': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'gemini': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'deepseek': return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
      case 'ollama':
      case 'meta': return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      default: return 'bg-gray-500/15 text-gray-400 border-gray-500/30';
    }
  };

  const handleConfigureKeys = () => {
    window.dispatchEvent(new CustomEvent('ai-web-ide:open-settings'));
    setIsOpen(false);
  };

  return (
    <div className="relative shrink-0" ref={menuRef}>
      {/* Trigger Button */}
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-1.5 py-1 text-xs font-medium text-[var(--text-1)] hover:text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-lg border border-[var(--border-0)] transition-colors shadow-sm shrink"
        title="Switch AI Model"
      >
        <span className="font-semibold truncate max-w-[75px] sm:max-w-[110px] text-[var(--text-0)]">
          {selected.name}
        </span>
        <ChevronDown size={12} className="text-[var(--text-2)] shrink-0" />
      </button>

      {/* Selector Popover */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-[var(--bg-1)] border border-[var(--border-0)] rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
          
          {/* Header & Search */}
          <div className="p-2.5 border-b border-[var(--border-0)] bg-[var(--bg-0)]/60">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-2)] border border-[var(--border-0)] rounded-lg focus-within:border-[var(--accent)] transition-all">
              <Search size={14} className="text-[var(--text-3)] shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models or providers..."
                className="w-full bg-transparent text-xs outline-none text-[var(--text-0)] placeholder-[var(--text-3)]"
                autoFocus
              />
            </div>
          </div>

          {/* Model Groups */}
          <div className="max-h-[320px] overflow-y-auto custom-scrollbar p-1.5 space-y-3">
            {categories.map((cat) => {
              const categoryModels = filteredModels.filter(m => m.category === cat.id);
              if (categoryModels.length === 0) return null;

              return (
                <div key={cat.id} className="space-y-1">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                    {cat.label}
                  </div>

                  {categoryModels.map((model) => {
                    const isSelected = currentSelectedId === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => {
                          setSelectedModel(model.id);
                          setIsOpen(false);
                        }}
                        className={`flex flex-col p-2.5 rounded-lg text-left transition-all w-full border ${
                          isSelected
                            ? 'bg-[var(--accent)]/10 border-[var(--accent)]/40 text-[var(--text-0)] shadow-sm'
                            : 'bg-[var(--bg-0)]/40 hover:bg-[var(--bg-2)] border-transparent text-[var(--text-1)]'
                        }`}
                      >
                        {/* Top row: Name + Provider Badge + Checkmark */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-xs text-[var(--text-0)] truncate">
                              {model.name}
                            </span>
                            <span className={`px-1.5 py-0.2 text-[9px] font-semibold uppercase rounded border ${getProviderBadgeStyle(model.provider)}`}>
                              {model.providerLabel}
                            </span>
                          </div>
                          {isSelected && <Check size={14} className="text-[var(--accent)] shrink-0" />}
                        </div>

                        {/* Description */}
                        {model.description && (
                          <p className="text-[11px] text-[var(--text-2)] mb-2 line-clamp-1">
                            {model.description}
                          </p>
                        )}

                        {/* Bottom Row: Context Window + Badges */}
                        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[var(--border-0)]/40">
                          <span className="text-[var(--text-3)] font-mono font-medium">
                            Context: {model.contextWindow}
                          </span>
                          <div className="flex items-center gap-1">
                            {model.badges.includes('fast') && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                                <Zap size={10} /> Fast
                              </span>
                            )}
                            {model.badges.includes('smart') && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">
                                <Brain size={10} /> Smart
                              </span>
                            )}
                            {model.badges.includes('tools') && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">
                                <Wrench size={10} /> Tools
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {filteredModels.length === 0 && (
              <div className="py-6 text-center text-xs text-[var(--text-3)]">
                No models match "{searchQuery}"
              </div>
            )}
          </div>

          {/* Footer Settings Link */}
          <div className="p-2 border-t border-[var(--border-0)] bg-[var(--bg-0)]">
            <button
              type="button"
              onClick={handleConfigureKeys}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-[var(--text-2)] hover:text-[var(--text-0)] hover:bg-[var(--bg-2)] rounded-lg transition-colors w-full"
            >
              <Settings size={13} />
              <span>Configure API keys & Ollama...</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
