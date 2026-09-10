import { AIContext } from '../types/ai.types';

const BASE_URL = '/api/ai';

// ─────────────────────────────────────────────────────────────────────────────
// Class-based service — one instance per editor tab.
// Eliminates global mutable state and race conditions between multiple tabs.
// ─────────────────────────────────────────────────────────────────────────────
export class InlineCompletionService {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private dropdownDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private dropdownAbortController: AbortController | null = null;

  // Cache last completion to avoid duplicate network requests for same prefix
  private lastPrefix = '';
  private lastCompletion = '';

  /**
   * Fetch ghost-text inline completion with debounce + abort.
   * Returns empty string if disabled, no content, or aborted.
   */
  async fetchInlineCompletion(
    prefix: string,
    suffix: string,
    language: string,
    context: AIContext,
    delayMs = 400
  ): Promise<string> {
    // Fast cache hit — same prefix → return cached result immediately
    if (prefix === this.lastPrefix && this.lastCompletion) {
      return this.lastCompletion;
    }

    return new Promise((resolve) => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.abortController?.abort();

      this.debounceTimer = setTimeout(async () => {
        this.abortController = new AbortController();
        const { signal } = this.abortController;

        try {
          const response = await fetch(`${BASE_URL}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix, suffix, language, context }),
            signal,
          });

          if (!response.ok) {
            resolve('');
            return;
          }

          const data = await response.json() as { completion?: string };
          const cleaned = cleanCompletion(data.completion || '');

          // Cache the result for this prefix
          this.lastPrefix = prefix;
          this.lastCompletion = cleaned;

          resolve(cleaned);
        } catch (err) {
          // AbortError is expected on cancel — resolve empty silently
          if ((err as Error).name !== 'AbortError') {
            resolve('');
          }
          // If aborted, the promise silently resolves empty (Monaco handles it via cancellation token)
          resolve('');
        }
      }, delayMs);
    });
  }

  /**
   * Fetch dropdown completion suggestions (used by registerCompletionItemProvider).
   * Accepts an external AbortSignal so Monaco can cancel the request cleanly.
   */
  async fetchDropdownCompletion(
    prefix: string,
    suffix: string,
    language: string,
    context: AIContext,
    externalSignal?: AbortSignal,
    delayMs = 400
  ): Promise<any[]> {
    return new Promise((resolve) => {
      if (this.dropdownDebounceTimer) clearTimeout(this.dropdownDebounceTimer);
      this.dropdownAbortController?.abort();

      this.dropdownDebounceTimer = setTimeout(async () => {
        this.dropdownAbortController = new AbortController();

        // Merge our internal abort with the external one using a combined controller
        const combinedController = new AbortController();
        const abort = () => combinedController.abort();
        this.dropdownAbortController.signal.addEventListener('abort', abort, { once: true });
        externalSignal?.addEventListener('abort', abort, { once: true });

        if (externalSignal?.aborted || this.dropdownAbortController.signal.aborted) {
          resolve([]);
          return;
        }

        try {
          const response = await fetch(`${BASE_URL}/autocomplete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix, suffix, language, context }),
            signal: combinedController.signal,
          });

          if (!response.ok) {
            resolve([]);
            return;
          }

          const data = await response.json();
          resolve(data.items || []);
        } catch {
          resolve([]);
        }
      }, delayMs);
    });
  }

  /** Cancel any in-flight inline completion request */
  cancelInlineCompletion(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.abortController?.abort();
    this.debounceTimer = null;
    this.abortController = null;
  }

  /** Invalidate the completion cache (call when editor content changes significantly) */
  invalidateCache(): void {
    this.lastPrefix = '';
    this.lastCompletion = '';
  }

  /** Clean up all timers and abort controllers — call on editor dispose */
  dispose(): void {
    this.cancelInlineCompletion();
    if (this.dropdownDebounceTimer) clearTimeout(this.dropdownDebounceTimer);
    this.dropdownAbortController?.abort();
    this.invalidateCache();
  }
}

/** Factory — use this in MonacoEditor to get a per-tab instance */
export function createInlineCompletionService(): InlineCompletionService {
  return new InlineCompletionService();
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy functional API — backward compatible shim.
// The Monaco inline-completion provider registration (global, once per language)
// still uses these. For new per-tab usage, prefer createInlineCompletionService().
// ─────────────────────────────────────────────────────────────────────────────
const _sharedService = new InlineCompletionService();

export async function fetchInlineCompletion(
  prefix: string,
  suffix: string,
  language: string,
  context: AIContext,
  delayMs = 400
): Promise<string> {
  return _sharedService.fetchInlineCompletion(prefix, suffix, language, context, delayMs);
}

export function cancelInlineCompletion(): void {
  _sharedService.cancelInlineCompletion();
}

export async function fetchDropdownCompletion(
  prefix: string,
  suffix: string,
  language: string,
  context: AIContext,
  signal?: AbortSignal,
  delayMs = 400
): Promise<any[]> {
  return _sharedService.fetchDropdownCompletion(prefix, suffix, language, context, signal, delayMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal utility
// ─────────────────────────────────────────────────────────────────────────────
function cleanCompletion(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
  }
  return cleaned.replace(/^\n+/, '');
}
