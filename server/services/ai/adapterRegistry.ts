import { ModelAdapter, ModelInfo } from './adapters/types';
import { OpenAIAdapter } from './adapters/openaiAdapter';
import { GeminiAdapter } from './adapters/geminiAdapter';
import { OllamaAdapter } from './adapters/ollamaAdapter';

class AdapterRegistry {
  private adapters: Map<string, ModelAdapter> = new Map();

  constructor() {
    this.register(new OpenAIAdapter());
    this.register(new GeminiAdapter());
    this.register(new OllamaAdapter());
  }

  register(adapter: ModelAdapter) {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(providerId: string): ModelAdapter {
    const adapter = this.adapters.get(providerId.toLowerCase());
    if (!adapter) {
      throw new Error(`AI Provider ${providerId} is not supported.`);
    }
    return adapter;
  }

  getProviders(): { id: string; name: string }[] {
    return Array.from(this.adapters.values()).map(a => ({ id: a.id, name: a.name }));
  }

  async getAllModels(): Promise<ModelInfo[]> {
    // Return a comprehensive list of models across all providers
    return [
      // OpenAI Models
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },
      // Gemini Models
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini' },
      // NVIDIA & Local Models
      { id: 'nvidia-nemotron', name: 'NVIDIA Nemotron-4 340B', provider: 'nvidia' },
      { id: 'llama3', name: 'Llama 3', provider: 'local' },
      { id: 'mistral', name: 'Mistral', provider: 'local' },
    ];
  }
}

export const adapterRegistry = new AdapterRegistry();
