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
    const allModels: ModelInfo[] = [];
    for (const adapter of this.adapters.values()) {
      try {
        const models = await adapter.getModels();
        allModels.push(...models);
      } catch (e) {
        console.warn(`Failed to get models for provider ${adapter.id}`, e);
      }
    }
    return allModels;
  }
}

export const adapterRegistry = new AdapterRegistry();
