import { create } from 'zustand';
import { ChatMessage, AIContext, AISettings, SessionContext, ModelInfo, BehaviorProfile, Session } from '../types/ai.types';

interface AIStore {
  messages: ChatMessage[];
  isStreaming: boolean;
  isLoading: boolean;
  context: AIContext;
  sessionContext: SessionContext;
  settings: AISettings;
  error: string | null;

  selectedModel: string;
  selectedProfile: string;
  availableModels: ModelInfo[];
  availableProfiles: BehaviorProfile[];
  activeSessionId: string | null;
  sessions: Session[];
  activeMode: 'chat' | 'work';
  webSearchEnabled: boolean;
  memoryEnabled: boolean;
  
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  appendToLastMessage: (chunk: string) => void;
  finalizeStreaming: () => void;
  clearMessages: () => void;
  setStreaming: (streaming: boolean) => void;
  setLoading: (loading: boolean) => void;
  updateContext: (context: Partial<AIContext>) => void;
  updateSessionContext: (context: Partial<SessionContext>) => void;
  updateSettings: (settings: Partial<AISettings>) => void;
  setError: (error: string | null) => void;

  setSelectedModel: (modelId: string) => void;
  setSelectedProfile: (profileId: string) => void;
  setActiveMode: (mode: 'chat' | 'work') => void;
  toggleWebSearch: () => void;
  toggleMemory: () => void;
  fetchModels: () => Promise<void>;
  createSession: () => void;
  deleteSession: (id: string) => void;
  loadSession: (id: string) => void;
  updateMessageMetadata: (id: string, metadata: Partial<ChatMessage>) => void;
}

const defaultSettings: AISettings = {
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: '',
  maxTokens: 2000,
  temperature: 0.7,
  streamResponses: true,
  includeFileContext: true,
  includeWorkspaceContext: true,
  inlineCompletionsEnabled: true,
  inlineCompletionsDelay: 400,
};

const defaultSessionContext: SessionContext = {
  recentActions: []
};

const defaultProfiles: BehaviorProfile[] = [
  { id: 'concise', name: 'Concise', description: 'Brief and direct answers', temperature: 0.3, topP: 1, maxTokens: 1000, systemPromptModifier: 'Be as concise as possible.', color: '#3b82f6', icon: 'zap' },
  { id: 'thorough', name: 'Thorough', description: 'Detailed and explanatory', temperature: 0.7, topP: 1, maxTokens: 4000, systemPromptModifier: 'Provide detailed explanations and breakdown of code.', color: '#a855f7', icon: 'book-open' },
  { id: 'creative', name: 'Creative', description: 'Out-of-the-box solutions', temperature: 0.9, topP: 1, maxTokens: 4000, systemPromptModifier: 'Be creative and explore alternative solutions.', color: '#f97316', icon: 'sparkles' },
  { id: 'safe', name: 'Safe', description: 'Conservative and robust', temperature: 0.1, topP: 1, maxTokens: 2000, systemPromptModifier: 'Write robust, safe, and heavily tested code.', color: '#22c55e', icon: 'shield' }
];

export const useAIStore = create<AIStore>((set, get) => ({
  messages: [],
  isStreaming: false,
  isLoading: false,
  context: {},
  sessionContext: defaultSessionContext,
  settings: defaultSettings,
  error: null,

  selectedModel: 'claude-3-5-sonnet',
  selectedProfile: 'concise',
  availableModels: [],
  availableProfiles: defaultProfiles,
  activeSessionId: null,
  sessions: [],
  activeMode: 'chat',
  webSearchEnabled: false,
  memoryEnabled: true,

  addMessage: (message) => {
    set((state) => ({ messages: [...state.messages, message] }));
  },

  updateLastMessage: (content) => {
    set((state) => {
      const messages = [...state.messages];
      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          content,
        };
      }
      return { messages };
    });
  },

  appendToLastMessage: (chunk) => {
    set((state) => {
      const messages = [...state.messages];
      if (messages.length > 0) {
        const last = messages[messages.length - 1];
        messages[messages.length - 1] = {
          ...last,
          content: last.content + chunk,
          isStreaming: true,
        };
      }
      return { messages };
    });
  },

  finalizeStreaming: () => {
    set((state) => {
      const messages = [...state.messages];
      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          isStreaming: false,
        };
      }
      return { messages, isStreaming: false };
    });
  },

  clearMessages: () => set({ messages: [] }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  setLoading: (loading) => set({ isLoading: loading }),

  updateContext: (context) => {
    set((state) => ({ context: { ...state.context, ...context } }));
  },

  updateSessionContext: (context) => {
    set((state) => ({ sessionContext: { ...state.sessionContext, ...context } }));
  },

  updateSettings: (settings) => {
    set((state) => ({ settings: { ...state.settings, ...settings } }));
  },

  setError: (error) => set({ error }),

  setSelectedModel: (modelId) => set({ selectedModel: modelId }),
  setSelectedProfile: (profileId) => set({ selectedProfile: profileId }),
  setActiveMode: (mode) => set({ activeMode: mode }),
  toggleWebSearch: () => set((state) => ({ webSearchEnabled: !state.webSearchEnabled })),
  toggleMemory: () => set((state) => ({ memoryEnabled: !state.memoryEnabled })),
  
  fetchModels: async () => {
    try {
      const response = await fetch('/api/ai/models');
      if (response.ok) {
        const data = await response.json();
        const models = data.models || [];
        
        // Auto-select first model if current is not in available list
        const currentSelected = get().selectedModel;
        const isCurrentAvailable = models.some((m: any) => m.id === currentSelected);
        
        set({ 
          availableModels: models,
          ...(models.length > 0 && !isCurrentAvailable ? { selectedModel: models[0].id } : {})
        });
      } else {
        set({ availableModels: [] });
      }
    } catch (e) {
      set({ availableModels: [] });
    }
  },

  createSession: () => {
    const newSession: Session = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      model: get().selectedModel,
      profile: get().selectedProfile,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    set(state => ({
      sessions: [newSession, ...state.sessions],
      activeSessionId: newSession.id,
      messages: []
    }));
  },

  deleteSession: (id) => {
    set(state => {
      const filtered = state.sessions.filter(s => s.id !== id);
      return {
        sessions: filtered,
        activeSessionId: state.activeSessionId === id ? (filtered[0]?.id || null) : state.activeSessionId,
        messages: state.activeSessionId === id ? (filtered[0]?.messages || []) : state.messages
      };
    });
  },

  loadSession: (id) => {
    set(state => {
      const session = state.sessions.find(s => s.id === id);
      if (session) {
        return { activeSessionId: id, messages: session.messages, selectedModel: session.model, selectedProfile: session.profile };
      }
      return state;
    });
  },

  updateMessageMetadata: (id, metadata) => {
    set(state => {
      const messages = state.messages.map(m => m.id === id ? { ...m, ...metadata } : m);
      
      // Update in active session if exists
      let sessions = state.sessions;
      if (state.activeSessionId) {
        sessions = state.sessions.map(s => 
          s.id === state.activeSessionId ? { ...s, messages, updatedAt: Date.now() } : s
        );
      }
      return { messages, sessions };
    });
  }
}));
