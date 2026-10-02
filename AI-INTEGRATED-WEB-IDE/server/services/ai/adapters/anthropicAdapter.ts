import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { ModelAdapter, ChatRequestOptions, ModelInfo } from './types';
import { buildSystemPrompt } from '../aiService';

export class AnthropicAdapter implements ModelAdapter {
  id = 'anthropic';
  name = 'Anthropic Claude';
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured.');
      }
      this.client = new Anthropic({
        apiKey,
      });
    }
    return this.client;
  }

  async getModels(): Promise<ModelInfo[]> {
    return [
      { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', provider: this.id },
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', provider: this.id },
      { id: 'claude-3-opus-latest', name: 'Claude 3 Opus', provider: this.id }
    ];
  }

  async streamChat(options: ChatRequestOptions, res: Response): Promise<void> {
    const { prompt, context, conversationHistory = [], model = 'claude-3-5-sonnet-latest', profile } = options;
    const systemPrompt = buildSystemPrompt(context, conversationHistory);
    const client = this.getClient();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const startTime = Date.now();
    try {
      const stream = await client.messages.create({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: profile?.maxTokens || 4096,
        temperature: profile?.temperature ?? 0.7,
        stream: true,
      });

      let usage = { prompt_tokens: 0, completion_tokens: 0 };
      for await (const event of stream) {
        if (event.type === 'message_start' && event.message.usage) {
          usage.prompt_tokens = event.message.usage.input_tokens;
        }
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: event.delta.text } }] })}\n\n`);
        }
        if (event.type === 'message_delta' && event.usage) {
          usage.completion_tokens = event.usage.output_tokens;
        }
      }

      const latencyMs = Date.now() - startTime;
      res.write(`data: ${JSON.stringify({
        done: true,
        usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens },
        latencyMs,
        model
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ error: error.message || 'Anthropic request failed' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  async getChatCompletion(options: ChatRequestOptions): Promise<string> {
    const { prompt, context, conversationHistory = [], model = 'claude-3-5-sonnet-latest', profile } = options;
    const systemPrompt = buildSystemPrompt(context, conversationHistory);
    const client = this.getClient();

    const response = await client.messages.create({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: profile?.maxTokens || 4096,
      temperature: profile?.temperature ?? 0.7,
    });

    if (response.content[0].type === 'text') {
        return response.content[0].text;
    }
    return '';
  }
}
