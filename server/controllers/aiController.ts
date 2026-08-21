import { Request, Response, NextFunction } from 'express';
import { streamChatResponse, getChatCompletion, getInlineCompletion, AIContext } from '../services/ai/aiService';
import { runPairProgrammerAgent, runStreamingPairProgrammerAgent, autoDetectAndRecommendExtensions } from '../services/ai/agentService';
import { processNLU, ConversationEntry } from '../services/ai/nluService';
import { adapterRegistry } from '../services/ai/adapterRegistry';

export const aiController = {
  async getModels(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const models = await adapterRegistry.getAllModels();
      res.json({ models });
    } catch (error) {
      next(error);
    }
  },

  async getProviders(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const providers = adapterRegistry.getProviders();
      res.json({ providers });
    } catch (error) {
      next(error);
    }
  },

  async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { prompt, context = {}, conversationHistory = [], model, provider, profile, sessionId } = req.body as {
        prompt: string;
        context: AIContext;
        conversationHistory: ConversationEntry[];
        model?: string;
        provider?: string;
        profile?: { temperature?: number; maxTokens?: number };
        sessionId?: string;
      };

      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'prompt is required and must be a string' });
        return;
      }

      // NLU preprocessing — clean and correct the prompt
      const nluResult = processNLU(prompt, context, conversationHistory);
      const cleanedPrompt = nluResult.correctedInput || prompt;

      // Attach NLU metadata to context so the LLM can use it
      context.nluResult = {
        intent: nluResult.intent,
        confidence: nluResult.confidence,
        entities: nluResult.entities,
        executionPlan: nluResult.executionPlan
      };

      await streamChatResponse(cleanedPrompt, context, res, conversationHistory, { provider, model, profile, sessionId });
    } catch (error) {
      next(error);
    }
  },

  async agent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { task, context = {}, conversationHistory = [] } = req.body as {
        task: string;
        context: AIContext;
        conversationHistory: ConversationEntry[];
      };

      if (!task || typeof task !== 'string') {
        res.status(400).json({ error: 'task is required and must be a string' });
        return;
      }

      // Run NLU pipeline (local, <5ms)
      const nluResult = processNLU(task, context, conversationHistory);

      // Clarification — return question without executing any actions
      if (nluResult.needsClarification) {
        res.json({
          summary: nluResult.clarificationMessage || 'Could you provide more details?',
          plan: [],
          actions: [],
          nextSteps: ['Please provide more details so I can help you better.'],
          nluResult,
        });
        return;
      }

      // Destructive action confirmation — ask before proceeding
      if (nluResult.isDestructive) {
        res.json({
          summary: `⚠️ This will ${nluResult.intent} files. Please confirm by saying "yes" or "confirm".`,
          plan: nluResult.executionPlan,
          actions: [],
          nextSteps: ['Reply "yes" to proceed, or rephrase your request.'],
          nluResult,
        });
        return;
      }

      const result = await runPairProgrammerAgent(task, context, conversationHistory, nluResult);
      (result as any).nluResult = nluResult;
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async agentStream(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { task, context = {}, conversationHistory = [] } = req.body as {
        task: string;
        context: AIContext;
        conversationHistory: ConversationEntry[];
      };

      if (!task || typeof task !== 'string') {
        res.status(400).json({ error: 'task is required and must be a string' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Run NLU pipeline (local, <5ms)
      const nluResult = processNLU(task, context, conversationHistory);

      // Clarification — return question without executing any actions
      if (nluResult.needsClarification) {
        res.write(`data: ${JSON.stringify({ type: 'clarification', message: nluResult.clarificationMessage || 'Could you provide more details?', nluResult })}\n\n`);
        res.end();
        return;
      }

      if (nluResult.isDestructive) {
        res.write("data: " + JSON.stringify({ type: 'confirmation_required', message: `⚠️ This will ${nluResult.intent} files. Please confirm.`, plan: nluResult.executionPlan, nluResult }) + "\n\n");
        res.end();
        return;
      }

      await runStreamingPairProgrammerAgent(task, context, conversationHistory, nluResult, res);
      res.end();
    } catch (error) {
      console.error('Agent stream error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', error: (error as any).message || 'Internal server error' })}\n\n`);
      res.end();
    }
  },

  async explain(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, language = 'code', context = {} } = req.body as {
        code: string;
        language: string;
        context: AIContext;
      };

      const prompt = `Explain this ${language} code in detail:\n\n\`\`\`${language}\n${code}\n\`\`\``;
      await streamChatResponse(prompt, context, res);
    } catch (error) {
      next(error);
    }
  },

  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { description, language = 'typescript', context = {} } = req.body as {
        description: string;
        language: string;
        context: AIContext;
      };

      const prompt = `Generate production-ready ${language} code for:\n\n${description}\n\nProvide clean, well-commented code with explanations.`;
      await streamChatResponse(prompt, context, res);
    } catch (error) {
      next(error);
    }
  },

  async debug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, error: errorMsg, language = 'code', context = {} } = req.body as {
        code: string;
        error: string;
        language: string;
        context: AIContext;
      };

      const prompt = `Debug this ${language} code:\n\nError: ${errorMsg}\n\nCode:\n\`\`\`${language}\n${code}\n\`\`\`\n\nFind the root cause and provide a fix with explanation.`;
      await streamChatResponse(prompt, context, res);
    } catch (error) {
      next(error);
    }
  },

  async refactor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, instruction, language = 'code', context = {} } = req.body as {
        code: string;
        instruction: string;
        language: string;
        context: AIContext;
      };

      const prompt = `Refactor this ${language} code: ${instruction}\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide refactored code with explanations of all changes.`;
      await streamChatResponse(prompt, context, res);
    } catch (error) {
      next(error);
    }
  },

  async inlineEdit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, instruction, language = 'code', prefix = '', suffix = '', context = {} } = req.body as {
        code: string;
        instruction: string;
        language: string;
        prefix?: string;
        suffix?: string;
        context?: AIContext;
      };

      const prompt = `You are an inline code editing engine like Cursor Cmd+K.
Modify the following ${language} code according to the instruction.
Return ONLY the modified code block inside \`\`\`${language} \`\`\` fences. Do NOT include any explanations, introductory text, or markdown outside the code block.

Instruction: ${instruction}

${prefix ? `Code BEFORE selection:\n${prefix.slice(-1500)}\n\n` : ''}Selected code to modify:
\`\`\`${language}
${code}
\`\`\`
${suffix ? `\nCode AFTER selection:\n${suffix.slice(0, 1500)}` : ''}`;

      const raw = await getChatCompletion(prompt, context, 4000);
      let cleaned = raw.trim();
      const match = cleaned.match(/```[\w]*\s*([\s\S]*?)```/);
      if (match) {
        cleaned = match[1].trim();
      } else {
        cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
      }
      res.json({ code: cleaned });
    } catch (error) {
      next(error);
    }
  },

  async review(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, language = 'code', context = {} } = req.body as {
        code: string;
        language: string;
        context: AIContext;
      };

      const prompt = `Review this ${language} code for quality, performance, security, and best practices:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide specific, actionable feedback.`;
      await streamChatResponse(prompt, context, res);
    } catch (error) {
      next(error);
    }
  },

  async generateTests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, language = 'code', framework = 'jest', context = {} } = req.body as {
        code: string;
        language: string;
        framework: string;
        context: AIContext;
      };

      const prompt = `Write comprehensive ${framework} unit tests for this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nInclude: happy path, edge cases, error scenarios, and mock usage.`;
      await streamChatResponse(prompt, context, res);
    } catch (error) {
      next(error);
    }
  },

  async generateDocs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, language = 'code', context = {} } = req.body as {
        code: string;
        language: string;
        context: AIContext;
      };

      const prompt = `Generate comprehensive documentation for this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nInclude JSDoc/docstrings, parameter types, return values, examples.`;
      await streamChatResponse(prompt, context, res);
    } catch (error) {
      next(error);
    }
  },

  async complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { prefix = '', suffix = '', language = 'plaintext', context = {} } = req.body as {
        prefix: string;
        suffix: string;
        language: string;
        context: AIContext;
      };

      const completion = await getInlineCompletion(prefix, suffix, language, context);
      res.json({ completion });
    } catch (error) {
      next(error);
    }
  },

  async autocomplete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { prefix = '', suffix = '', language = 'plaintext', context = {} } = req.body as {
        prefix: string;
        suffix: string;
        language: string;
        context: AIContext;
      };

      const prompt = `You are a code completion engine (IntelliSense) for a code editor.
The user just triggered autocomplete at the cursor. Provide a JSON array of up to 5 highly relevant completion suggestions for the current context.

Language: ${language}

Code BEFORE cursor:
${prefix.slice(-1000)}

Code AFTER cursor:
${suffix.slice(0, 500)}

Respond ONLY with valid JSON in this format:
[
  {
    "label": "methodName",
    "insertText": "methodName(\${1:arg})",
    "detail": "short description",
    "kind": "Method"
  }
]
Supported kinds: Method, Function, Variable, Class, Interface, Keyword, Snippet.
Do NOT include markdown formatting or explanations. Just the JSON array.`;

      const raw = await getChatCompletion(prompt, context, 500);
      let cleaned = raw.trim();
      const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        cleaned = match[1].trim();
      } else {
        cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
      }
      
      let items = [];
      try {
        items = JSON.parse(cleaned);
        if (!Array.isArray(items)) items = [];
      } catch (e) {
        items = [];
      }

      res.json({ items });
    } catch (error) {
      next(error);
    }
  },

  async convert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, fromLang, toLang, context = {} } = req.body as {
        code: string;
        fromLang: string;
        toLang: string;
        context: AIContext;
      };

      const prompt = `Convert this ${fromLang} code to ${toLang}:\n\n\`\`\`${fromLang}\n${code}\n\`\`\`\n\nProvide idiomatic ${toLang} code with explanations.`;
      await streamChatResponse(prompt, context, res);
    } catch (error) {
      next(error);
    }
  },

  async autoExtensions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { language } = req.body as { language?: string };
      const recommendations = await autoDetectAndRecommendExtensions(language);
      res.json({ recommendations: recommendations || [] });
    } catch (error) {
      next(error);
    }
  },
};

