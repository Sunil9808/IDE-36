import { ModelAdapter, ModelInfo } from './adapters/types';
import { OpenAIAdapter } from './adapters/openaiAdapter';
import { GeminiAdapter } from './adapters/geminiAdapter';
import { AnthropicAdapter } from './adapters/anthropicAdapter';
import { OllamaAdapter } from './adapters/ollamaAdapter';

class AdapterRegistry {
  private adapters: Map<string, ModelAdapter> = new Map();

  constructor() {
    this.register(new OpenAIAdapter());
    this.register(new GeminiAdapter());
    this.register(new AnthropicAdapter());
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
    // Only query the active provider to avoid connection errors from unconfigured providers
    const activeProvider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
    const adapterId = activeProvider === 'sambanova' ? 'openai' : activeProvider;
    const adapter = this.adapters.get(adapterId);
    if (adapter) {
      try {
        return await adapter.getModels();
      } catch (e) {
        console.warn(`Failed to get models for provider ${adapter.id}:`, (e as Error).message);
        return [];
      }
    }
    return [];
  }
}

export const adapterRegistry = new AdapterRegistry();
