import { Response } from 'express';
import { ModelAdapter, ChatRequestOptions, ModelInfo } from './types';
import { buildSystemPrompt } from '../aiService';

export class OllamaAdapter implements ModelAdapter {
  id = 'ollama';
  name = 'Ollama (Local)';

  private getBaseUrl(): string {
    return process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/api/tags`);
      if (!response.ok) {
        throw new Error('Failed to fetch Ollama models');
      }
      const data = await response.json() as { models: Array<{ name: string }> };
      return data.models.map(m => ({
        id: m.name,
        name: m.name,
        provider: this.id
      }));
    } catch (e) {
      console.warn('Could not fetch Ollama models, is Ollama running?', e);
      return [];
    }
  }

  async streamChat(options: ChatRequestOptions, res: Response): Promise<void> {
    const { prompt, context, conversationHistory = [], model = 'llama3', profile } = options;
    const systemPrompt = buildSystemPrompt(context, conversationHistory);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const startTime = Date.now();
    try {
      // Build proper multi-turn message array from conversation history
      const messages: { role: string; content: string }[] = [
        { role: 'system', content: systemPrompt },
        // Inject last 10 turns of history for multi-turn context
        ...conversationHistory.slice(-10).map(entry => ({
          role: entry.role,
          content: entry.content,
        })),
        { role: 'user', content: prompt },
      ];

      const response = await fetch(`${this.getBaseUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          options: {
            temperature: profile?.temperature ?? 0.7,
            num_predict: profile?.maxTokens,
          },
          stream: true
        })
      });

      if (!response.ok) {
         throw new Error(`Ollama request failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let usage = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim() !== '');

        for (const line of lines) {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parsed.message.content } }] })}\n\n`);
          }
          if (parsed.done) {
            usage = {
              prompt_tokens: parsed.prompt_eval_count || 0,
              completion_tokens: parsed.eval_count || 0,
            };
          }
        }
      }

      const latencyMs = Date.now() - startTime;
      res.write(`data: ${JSON.stringify({
        done: true,
        usage: usage ? { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens } : undefined,
        latencyMs,
        model
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ error: error.message || 'Ollama request failed' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  async getChatCompletion(options: ChatRequestOptions): Promise<string> {
    const { prompt, context, conversationHistory = [], model = 'llama3', profile } = options;
    const systemPrompt = buildSystemPrompt(context, conversationHistory);

    // Build multi-turn message array (same approach as streamChat)
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10).map(entry => ({
        role: entry.role,
        content: entry.content,
      })),
      { role: 'user', content: prompt },
    ];

    const response = await fetch(`${this.getBaseUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        options: {
          temperature: profile?.temperature ?? 0.7,
          num_predict: profile?.maxTokens,
        },
        stream: false
      })
    });

    if (!response.ok) {
       throw new Error(`Ollama request failed: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.message?.content || '';
  }
}
