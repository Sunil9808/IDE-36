export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  tokens?: number;
  model?: string;
  codeBlocks?: CodeBlock[];
}

export interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
}

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
  openFiles?: Array<{
    path: string;
    name: string;
    language: string;
  }>;
  workspaceName?: string;
  workspacePath?: string;
  recentErrors?: string[];
  terminalOutput?: string;
}

export interface AIRequest {
  type: AIRequestType;
  prompt: string;
  context: AIContext;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export type AIRequestType = 
  | 'chat'
  | 'explain'
  | 'generate'
  | 'debug'
  | 'refactor'
  | 'document'
  | 'convert'
  | 'review'
  | 'test'
  | 'performance';

export interface AIResponse {
  id: string;
  type: AIRequestType;
  content: string;
  tokens: number;
  model: string;
  timestamp: number;
  duration: number;
}

export interface AICommand {
  id: string;
  label: string;
  description: string;
  type: AIRequestType;
  icon: string;
  shortcut?: string;
  prompt?: string;
}

export interface AIModel {
  id: string;
  name: string;
  provider: 'openai' | 'gemini' | 'anthropic';
  maxTokens: number;
  supportsStreaming: boolean;
  description: string;
}

export interface AISettings {
  provider: 'openai' | 'gemini';
  model: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
  streamResponses: boolean;
  includeFileContext: boolean;
  includeWorkspaceContext: boolean;
  inlineCompletionsEnabled: boolean;
  inlineCompletionsDelay: number;
}

// ── NLU Types ─────────────────────────────────────────────────────────────────

export type NLUIntent =
  | 'create' | 'edit' | 'delete' | 'rename'
  | 'explain' | 'refactor' | 'debug' | 'optimize'
  | 'generate' | 'search' | 'build' | 'run'
  | 'install' | 'test' | 'deploy' | 'review'
  | 'convert' | 'translate' | 'document'
  | 'question' | 'unknown';

export interface NLUEntities {
  frameworks: string[];
  languages: string[];
  files: string[];
  folders: string[];
  features: string[];
  packages: string[];
}

export interface NLUResult {
  originalInput: string;
  cleanedInput: string;
  correctedInput: string;
  intent: NLUIntent;
  confidence: number;
  entities: NLUEntities;
  needsClarification: boolean;
  clarificationMessage?: string;
  executionPlan: string[];
  isDestructive: boolean;
}

export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface SessionContext {
  currentTask?: string;
  framework?: string;
  language?: string;
  projectName?: string;
  recentActions: string[];
}

export interface AgentRunResult {
  summary: string;
  plan: string[];
  actions: Array<{ type: string; target: string; success: boolean; output: string }>;
  nextSteps: string[];
  nluResult?: NLUResult;
  extensionRecommendations?: Array<{ extensionId: string; language: string; reason: string }>;
  detectedLanguages?: string[];
}
