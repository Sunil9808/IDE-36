import { Response } from 'express';
import { ConversationEntry } from './nluService';
import { adapterRegistry } from './adapterRegistry';
import { AIContext } from './adapters/types';

export function getAIProvider(): string {
  return (process.env.AI_PROVIDER || 'gemini').toLowerCase();
}

export function getAIModel(): string {
  const provider = getAIProvider();
  if (provider === 'gemini') return process.env.GEMINI_MODEL || 'gemini-1.5-pro';
  if (provider === 'sambanova') return process.env.SAMBANOVA_MODEL || 'Meta-Llama-3.3-70B-Instruct';
  if (provider === 'anthropic') return process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
  if (provider === 'ollama') return process.env.OLLAMA_MODEL || 'llama3';
  return process.env.OPENAI_MODEL || 'gpt-4o';
}

export { AIContext };

export function buildSystemPrompt(context: AIContext, conversationHistory: ConversationEntry[] = []): string {
  let systemPrompt = `You are an expert AI programming assistant integrated into AI Web IDE, a VS Code-style web IDE.

Your capabilities:
- Explain code clearly and thoroughly
- Generate clean, production-ready code
- Debug errors with precise diagnosis
- Refactor code for better quality
- Write comprehensive tests
- Create detailed documentation
- Convert code between languages
- Review code for quality, security, and performance
- When running in pair-programmer mode, produce concrete workspace changes through the available tools instead of only giving advice

Always respond with:
- Clear explanations
- Well-formatted code blocks using \`\`\`language syntax
- Actionable suggestions
- Best practices

IMPORTANT INSTRUCTION REGARDING CONTEXT:
You will be provided with the user's current active file and workspace context. 
If the user asks a general programming question, algorithm request, or conceptual question, DO NOT force the answer into the context of their active file. Answer it generally. (NOTE: If asked for the "Find-S" algorithm, ALWAYS write the Machine Learning algorithm for finding the most specific hypothesis from positive training data. Do NOT write a linear search or string matching algorithm). Only modify or reference the active file if the user's request is clearly related to it.

INTENT INFERENCE & FORGIVENESS: 
Like a highly intelligent senior engineer, you must actively deduce the user's true intent even if their prompt is poorly worded, has typos, uses the wrong terminology, or is grammatically incorrect. DO NOT take poorly phrased questions purely literally if a literal interpretation makes no sense. Instead, figure out what they *actually meant* to ask, and provide the correct, industry-standard solution for their underlying intent.

LANGUAGE AUTO-DETECTION:
If the user asks you to implement an algorithm or write code but does not specify a programming language:
- For Web/UI components: Default to React/TypeScript.
- For Machine Learning, Data Science, or heavy mathematical algorithms: ALWAYS automatically default to Python.
- If they specify a language, respect it unconditionally.

Current workspace context:`;

  if (context.workspaceName) {
    systemPrompt += `\n- Workspace: ${context.workspaceName}`;
  }

  if (context.currentFile) {
    systemPrompt += `\n- Active file: ${context.currentFile.path} (${context.currentFile.language})`;
    if (context.currentFile.content && context.currentFile.content.length < 8000) {
      systemPrompt += `\n\nCurrent file content:\n\`\`\`${context.currentFile.language}\n${context.currentFile.content}\n\`\`\``;
    }
  }

  if (context.openFiles && context.openFiles.length > 0) {
    systemPrompt += `\n- Open files: ${context.openFiles.map(f => f.path).join(', ')}`;
  }

  if (context.recentErrors && context.recentErrors.length > 0) {
    systemPrompt += `\n\nRecent errors:\n${context.recentErrors.join('\n')}`;
  }

  if (context.terminalOutput) {
    systemPrompt += `\n\nRecent terminal output:\n${context.terminalOutput}`;
  }

  if (context.nluResult) {
    systemPrompt += `\n\n=== NLU / NLP Intent Analysis ===\n- Detected Intent: ${context.nluResult.intent}\n- Entities: ${JSON.stringify(context.nluResult.entities)}\n- Internal Execution Plan: ${JSON.stringify(context.nluResult.executionPlan)}\n\n(CRITICAL INSTRUCTION: The NLU Intent Analysis above is internal metadata. DO NOT acknowledge it, DO NOT talk about the "detected intent" or "entities" to the user, and DO NOT ask the user to confirm the context. Just silently use this context to directly answer their prompt. If they asked for a general concept/algorithm, prioritize it and DO NOT force it into their active file.)`;
  }

  return systemPrompt;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function streamChatResponse(
  prompt: string, 
  context: AIContext, 
  res: Response, 
  conversationHistory: ConversationEntry[] = [],
  options?: { provider?: string; model?: string; profile?: { temperature?: number; maxTokens?: number }; sessionId?: string }
): Promise<void> {
  // Ignore the frontend's requested provider and ALWAYS use the single configured backend provider.
  // This allows aggregator APIs (like OpenRouter or a proxy) to handle all models through one adapter.
  const provider = getAIProvider();
  const model = options?.model || getAIModel();
  
  const adapter = adapterRegistry.getAdapter(provider === 'sambanova' ? 'openai' : provider);
  
  await adapter.streamChat({
    prompt,
    context,
    conversationHistory,
    model,
    profile: options?.profile,
    sessionId: options?.sessionId
  }, res);
}

export async function getInlineCompletion(
  prefix: string,
  suffix: string,
  language: string,
  context: AIContext
): Promise<string> {
  const prompt = `You are an inline code completion engine like Cursor Tab / GitHub Copilot.
Complete the code at the cursor position. Return ONLY the text to insert at the cursor — no markdown fences, no explanation, no quotes.

Language: ${language}

Code BEFORE cursor:
${prefix.slice(-3000)}

Code AFTER cursor:
${suffix.slice(0, 1000)}

Rules:
- Return only the completion text (what comes next as the developer types)
- Match existing indentation and style
- Prefer short, focused completions (1-5 lines max)
- If no meaningful completion exists, return an empty response`;

  const result = await getChatCompletion(prompt, context, 256);
  return cleanInlineCompletion(result);
}

function cleanInlineCompletion(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
  }
  return cleaned.replace(/^\n+/, '');
}

export async function getChatCompletion(prompt: string, context: AIContext, maxTokens = 2000): Promise<string> {
  const provider = getAIProvider();
  const model = getAIModel();
  const adapter = adapterRegistry.getAdapter(provider === 'sambanova' ? 'openai' : provider);
  
  return adapter.getChatCompletion({
    prompt,
    context,
    model,
    profile: { maxTokens }
  });
}
