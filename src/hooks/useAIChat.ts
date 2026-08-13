import { useCallback, useRef } from 'react';
import { useAIStore } from '../store/aiStore';
import { useEditorStore } from '../store/editorStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { ChatMessage } from '../types/ai.types';
import { v4 as uuidv4 } from '../utils/uuid';

export function useAIChat() {
  const {
    messages, isStreaming, isLoading, error,
    addMessage, appendToLastMessage, finalizeStreaming,
    clearMessages, setStreaming, setError, context,
    selectedModel, selectedProfile, updateMessageMetadata, activeSessionId, availableModels
  } = useAIStore();

  const abortControllerRef = useRef<AbortController | null>(null);

  const { getActiveTab } = useEditorStore();
  const workspace = useWorkspaceStore((state) => state.workspace);

  const buildContext = useCallback(() => {
    const activeTab = getActiveTab();
    return {
      currentFile: activeTab ? {
        path: activeTab.filePath,
        content: activeTab.content,
        language: activeTab.language,
        name: activeTab.fileName,
      } : undefined,
      workspaceName: workspace?.name || 'my-project',
      workspacePath: workspace?.path,
      ...context,
    };
  }, [context, getActiveTab, workspace]);

  const sendMessage = useCallback(async (prompt: string) => {
    if (!prompt.trim() || isStreaming) return;

    // Create a new AbortController for this request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    const ctx = buildContext();
    const startTime = Date.now();
    const currentModelId = selectedModel;
    const currentProfileId = selectedProfile;

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: prompt,
      timestamp: startTime,
    };
    addMessage(userMsg);

    const assistantMsgId = uuidv4();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      modelUsed: currentModelId
    };
    addMessage(assistantMsg);
    setStreaming(true);
    setError(null);

    let tokenCount = 0;

    try {
      const modelInfo = availableModels.find(m => m.id === currentModelId);
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt, 
          context: ctx,
          model: currentModelId,
          provider: modelInfo?.provider,
          profile: currentProfileId,
          sessionId: activeSessionId,
          conversationHistory: useAIStore.getState().messages
            .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.isStreaming))
            .slice(0, -1) // Exclude the current prompt we just added
            .slice(-10)
            .map(m => ({ role: m.role, content: m.content.slice(0, 1500) }))
        }),
        signal
      });

      if (!response.ok) {
        let errorMsg = `AI request failed (${response.status})`;
        try {
          const errBody = await response.text();
          if (errBody) {
            try {
              const errJson = JSON.parse(errBody);
              errorMsg = errJson.error || errJson.message || errorMsg;
            } catch {
              errorMsg = errBody.slice(0, 200) || errorMsg;
            }
          }
        } catch {
          // ignore read errors
        }
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch (e) {
              continue; // Ignore JSON parse errors for incomplete chunks
            }

            if (parsed.error) {
              // Throw outside the JSON parse try-catch so the outer block catches it
              throw new Error(typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error));
            }

            const text = parsed.choices?.[0]?.delta?.content || parsed.text || '';
            if (text) {
              appendToLastMessage(text);
              tokenCount += Math.ceil(text.length / 4); // rough estimate
            }
            if (parsed.usage) {
              tokenCount = parsed.usage.total_tokens || tokenCount;
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        appendToLastMessage('\n\n*(Message generation cancelled)*');
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        appendToLastMessage(`\n\n⚠️ Error: ${msg}`);
        setError(msg);
      }
    } finally {
      const endTime = Date.now();
      const latencyMs = endTime - startTime;
      
      // Calculate estimated cost
      let estimatedCost = 0;
      const modelInfo = availableModels.find(m => m.id === currentModelId);
      if (modelInfo) {
        // very rough estimate
        estimatedCost = (tokenCount / 1000) * modelInfo.costPer1kOutput; 
      }

      updateMessageMetadata(assistantMsgId, {
        latencyMs,
        tokenCount,
        estimatedCost
      });
      
      finalizeStreaming();
      abortControllerRef.current = null;
    }
  }, [isStreaming, buildContext, addMessage, appendToLastMessage, finalizeStreaming, setStreaming, setError, selectedModel, selectedProfile, activeSessionId, updateMessageMetadata, availableModels]);

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const retryLastMessage = useCallback(() => {
    if (isStreaming || messages.length === 0) return;
    
    // Find last user message
    let lastUserMsg = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMsg = messages[i].content;
        break;
      }
    }
    
    if (lastUserMsg) {
      sendMessage(lastUserMsg);
    }
  }, [isStreaming, messages, sendMessage]);

  return {
    messages,
    isStreaming,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    cancelStream,
    retryLastMessage
  };
}
