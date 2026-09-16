import OpenAI from 'openai';
import { Response } from 'express';
import { ModelAdapter, ChatRequestOptions, ModelInfo } from './types';
import { buildSystemPrompt } from '../aiService'; // We will export this from aiService or move it

function parseMultimodalContent(text: string) {
  const regex = /!\[.*?\]\((data:image\/[^;]+;base64,[^\)]+)\)/g;
  let match;
  let lastIndex = 0;
  const contentArray: any[] = [];

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      contentArray.push({ type: 'text', text: text.substring(lastIndex, match.index) });
    }
    contentArray.push({
      type: 'image_url',
      image_url: { url: match[1] }
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    contentArray.push({ type: 'text', text: text.substring(lastIndex) });
  }

  if (contentArray.length === 0) {
    return text;
  }
  return contentArray;
}

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
    const defaultModel = process.env.OPENAI_MODEL || 'meta/llama-3.2-11b-vision-instruct';
    
    // Default list of working models for OpenAI / NVIDIA NIM endpoint
    const knownModels: ModelInfo[] = [
      { id: defaultModel, name: defaultModel.split('/').pop() + ' (Default)', provider: this.id },
      { id: 'meta/llama-3.2-11b-vision-instruct', name: 'Llama 3.2 11B Vision', provider: this.id },
      { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', name: 'Nemotron 3.5 Lightning 30B', provider: this.id },
      { id: 'moonshotai/kimi-k3', name: 'Kimi K3', provider: this.id },
    ];

    try {
      const client = this.getClient();
      const response = await client.models.list();
      if (response.data && response.data.length > 0) {
        const fetched = response.data.slice(0, 30).map(m => ({ id: m.id, name: m.id, provider: this.id }));
        // Ensure default model is first
        return [
          { id: defaultModel, name: defaultModel.split('/').pop() + ' (Default)', provider: this.id },
          ...fetched.filter(m => m.id !== defaultModel)
        ];
      }
    } catch (e) {
      // Fallback
    }

    return knownModels;
  }

  async streamChat(options: ChatRequestOptions, res: Response): Promise<void> {
    let { prompt, context, conversationHistory = [], model, profile } = options;
    
    // Use requested model, or fallback to environment OPENAI_MODEL, or default to working model
    if (!model || model === 'Select Model') {
      model = process.env.OPENAI_MODEL || 'meta/llama-3.2-11b-vision-instruct';
    }

    const systemPrompt = buildSystemPrompt(context, conversationHistory);
    const client = this.getClient();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Build messages with conversation history for multi-turn context
    const historyMessages = (conversationHistory || []).slice(-10).map(entry => ({
      role: (entry.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: typeof entry.content === 'string' ? entry.content.slice(0, 2000) : String(entry.content)
    }));

    const startTime = Date.now();
    try {
      const stream = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system' as const, content: systemPrompt },
          ...historyMessages,
          { role: 'user' as const, content: parseMultimodalContent(prompt) as any },
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
    let { prompt, context, conversationHistory = [], model, profile } = options;

    if (!model || model === 'Select Model') {
      model = process.env.OPENAI_MODEL || 'meta/llama-3.2-11b-vision-instruct';
    }

    const systemPrompt = buildSystemPrompt(context, conversationHistory);
    const client = this.getClient();

    // Build messages with conversation history
    const historyMessages = (conversationHistory || []).slice(-10).map(entry => ({
      role: (entry.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: typeof entry.content === 'string' ? entry.content.slice(0, 2000) : String(entry.content)
    }));

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system' as const, content: systemPrompt },
        ...historyMessages,
        { role: 'user' as const, content: prompt },
      ],
      max_tokens: profile?.maxTokens || 2000,
      temperature: profile?.temperature ?? 0.7,
    });

    return completion.choices[0]?.message?.content || '';
  }
}
