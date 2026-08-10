import { GoogleGenerativeAI, GenerativeModel, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { Response } from 'express';
import { ModelAdapter, ChatRequestOptions, ModelInfo } from './types';
import { buildSystemPrompt } from '../aiService';

export class GeminiAdapter implements ModelAdapter {
  id = 'gemini';
  name = 'Google Gemini';
  private client: GoogleGenerativeAI | null = null;
  private models: Record<string, GenerativeModel> = {};

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured.');
      }
      this.client = new GoogleGenerativeAI(apiKey);
    }
    return this.client;
  }

  private getModel(modelName: string): GenerativeModel {
    if (!this.models[modelName]) {
      const client = this.getClient();
      this.models[modelName] = client.getGenerativeModel({
        model: modelName,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      });
    }
    return this.models[modelName];
  }

  async getModels(): Promise<ModelInfo[]> {
    return [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: this.id },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: this.id },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: this.id }
    ];
  }

  async streamChat(options: ChatRequestOptions, res: Response): Promise<void> {
    const { prompt, context, conversationHistory = [], model = 'gemini-2.0-flash', profile } = options;
    const systemPrompt = buildSystemPrompt(context, conversationHistory);
    const genModel = this.getModel(model);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const startTime = Date.now();
    try {
      const fullPrompt = `${systemPrompt}\n\n---\n\nUser: ${prompt}\n\nAssistant:`;
      const result = await genModel.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: profile?.maxTokens,
          temperature: profile?.temperature ?? 0.7,
        }
      });

      let usage = null;
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
        }
        if (chunk.usageMetadata) {
          usage = {
            prompt_tokens: chunk.usageMetadata.promptTokenCount,
            completion_tokens: chunk.usageMetadata.candidatesTokenCount
          };
        }
      }

      const latencyMs = Date.now() - startTime;
      res.write(`data: ${JSON.stringify({
        done: true,
        usage: usage,
        latencyMs,
        model
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ error: error.message || 'Gemini request failed' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  async getChatCompletion(options: ChatRequestOptions): Promise<string> {
    const { prompt, context, conversationHistory = [], model = 'gemini-2.0-flash', profile } = options;
    const systemPrompt = buildSystemPrompt(context, conversationHistory);
    const genModel = this.getModel(model);

    const result = await genModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
      generationConfig: {
        maxOutputTokens: profile?.maxTokens || 2000,
        temperature: profile?.temperature ?? 0.7,
      },
    });

    return result.response.text();
  }
}
