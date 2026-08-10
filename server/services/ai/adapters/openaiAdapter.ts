import OpenAI from 'openai';
import { Response } from 'express';
import { ModelAdapter, ChatRequestOptions, ModelInfo } from './types';
import { buildSystemPrompt } from '../aiService'; // We will export this from aiService or move it

export class OpenAIAdapter implements ModelAdapter {
  id = 'openai';
  name = 'OpenAI';
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      const isSambaNova = process.env.AI_PROVIDER === 'sambanova';
      const apiKey = isSambaNova ? process.env.SAMBANOVA_API_KEY : process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(`${isSambaNova ? 'SAMBANOVA_API_KEY' : 'OPENAI_API_KEY'} is not configured.`);
      }
      this.client = new OpenAI({
        apiKey,
        baseURL: isSambaNova ? process.env.SAMBANOVA_BASE_URL || 'https://api.sambanova.ai/v1' : process.env.OPENAI_BASE_URL,
        timeout: parseInt(process.env.AI_TIMEOUT_MS || '300000', 10),
      });
    }
    return this.client;
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const client = this.getClient();
      const response = await client.models.list();
      return response.data.map(m => ({ id: m.id, name: m.id, provider: this.id }));
    } catch (e) {
      // Fallback
      return [
        { id: 'gpt-4o', name: 'GPT-4o', provider: this.id },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: this.id },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: this.id }
      ];
    }
  }

  async streamChat(options: ChatRequestOptions, res: Response): Promise<void> {
    const { prompt, context, conversationHistory = [], model = 'gpt-4o', profile } = options;
    const systemPrompt = buildSystemPrompt(context, conversationHistory);
    const client = this.getClient();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const startTime = Date.now();
    try {
      const stream = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: profile?.maxTokens || 8192,
        temperature: profile?.temperature ?? 0.7,
        stream: true,
        stream_options: { include_usage: true }
      });

      let usage = null;
      for await (const chunk of stream) {
        if (chunk.choices && chunk.choices.length > 0) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
          }
        }
        if (chunk.usage) {
          usage = chunk.usage;
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
      res.write(`data: ${JSON.stringify({ error: error.message || 'OpenAI request failed' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  async getChatCompletion(options: ChatRequestOptions): Promise<string> {
    const { prompt, context, conversationHistory = [], model = 'gpt-4o', profile } = options;
    const systemPrompt = buildSystemPrompt(context, conversationHistory);
    const client = this.getClient();

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: profile?.maxTokens || 2000,
      temperature: profile?.temperature ?? 0.7,
    });

    return completion.choices[0]?.message?.content || '';
  }
}
