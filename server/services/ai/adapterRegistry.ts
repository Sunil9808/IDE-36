import { ModelAdapter, ModelInfo } from './adapters/types';
import { OpenAIAdapter } from './adapters/openaiAdapter';
import { GeminiAdapter } from './adapters/geminiAdapter';
import { OllamaAdapter } from './adapters/ollamaAdapter';
import { AnthropicAdapter } from './adapters/anthropicAdapter';

class AdapterRegistry {
  private adapters: Map<string, ModelAdapter> = new Map();

  constructor() {
    this.register(new OpenAIAdapter());
    this.register(new GeminiAdapter());
    this.register(new OllamaAdapter());
    // Register Anthropic if key is configured
    if (process.env.ANTHROPIC_API_KEY) {
      this.register(new AnthropicAdapter());
    }
  }

  register(adapter: ModelAdapter) {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(providerId: string): ModelAdapter {
    const adapter = this.adapters.get(providerId.toLowerCase());
    if (!adapter) {
      throw new Error(`AI Provider "${providerId}" is not supported. Available providers: ${Array.from(this.adapters.keys()).join(', ')}`);
    }
    return adapter;
  }

  getProviders(): { id: string; name: string }[] {
    return Array.from(this.adapters.values()).map(a => ({ id: a.id, name: a.name }));
  }

  /**
   * Fetches live models from ALL registered adapters concurrently and merges.
   * Each adapter handles its own errors gracefully (returns [] on failure).
   * This replaces the old hardcoded static list.
   */
  async getAllModels(): Promise<ModelInfo[]> {
    const results = await Promise.allSettled(
      Array.from(this.adapters.values()).map(adapter => adapter.getModels())
    );

    const models: ModelInfo[] = [];
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        models.push(...result.value);
      }
      // Rejected means that adapter is unavailable — silently skip it
    });

    // De-duplicate by model ID (keeps first occurrence)
    const seen = new Set<string>();
    return models.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }

  /**
   * Checks health of each registered adapter.
   * Returns a map of adapterId → { available, modelCount }.
   */
  async getHealth(): Promise<Record<string, { available: boolean; modelCount: number; error?: string }>> {
    const entries = Array.from(this.adapters.entries());
    const results = await Promise.allSettled(
      entries.map(([, adapter]) => adapter.getModels())
    );

    const health: Record<string, { available: boolean; modelCount: number; error?: string }> = {};
    entries.forEach(([id], i) => {
      const result = results[i];
      if (result.status === 'fulfilled') {
        health[id] = { available: true, modelCount: result.value.length };
      } else {
        health[id] = { available: false, modelCount: 0, error: (result.reason as Error)?.message || 'Unknown error' };
      }
    });

    return health;
  }
}

export const adapterRegistry = new AdapterRegistry();
