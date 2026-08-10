import { Response } from 'express';
import { ConversationEntry } from '../nluService';

export interface AIContext {
  currentFile?: {
    path: string;
    content: string;
    language: string;
    name: string;
  };
  selectedCode?: {
    text: string;
    startLine: number;
    endLine: number;
    language: string;
  };
  openFiles?: Array<{ path: string; name: string; language: string }>;
  workspaceName?: string;
  workspacePath?: string;
  recentErrors?: string[];
  terminalOutput?: string;
}

export interface ChatProfile {
  temperature?: number;
  maxTokens?: number;
}

export interface ChatRequestOptions {
  prompt: string;
  context: AIContext;
  conversationHistory?: ConversationEntry[];
  model?: string;
  profile?: ChatProfile;
  sessionId?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface ModelAdapter {
  id: string;
  name: string;
  streamChat(options: ChatRequestOptions, res: Response): Promise<void>;
  getChatCompletion(options: ChatRequestOptions): Promise<string>;
  getModels(): Promise<ModelInfo[]>;
}
