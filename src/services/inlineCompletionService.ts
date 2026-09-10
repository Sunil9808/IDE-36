import { AIContext } from '../types/ai.types';

const BASE_URL = '/api/ai';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let abortController: AbortController | null = null;

export async function fetchInlineCompletion(
  prefix: string,
  suffix: string,
  language: string,
  context: AIContext,
  delayMs = 400
): Promise<string> {
  return new Promise((resolve) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (abortController) abortController.abort();

    debounceTimer = setTimeout(async () => {
      abortController = new AbortController();

      try {
        const response = await fetch(`${BASE_URL}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, suffix, language, context }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          resolve('');
          return;
        }

        const data = await response.json() as { completion?: string };
        resolve(cleanCompletion(data.completion || ''));
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          resolve('');
        }
      }
    }, delayMs);
  });
}

function cleanCompletion(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
  }
  return cleaned.replace(/^\n+/, '');
}

export function cancelInlineCompletion(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (abortController) abortController.abort();
}

let dropdownDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let dropdownAbortController: AbortController | null = null;

export async function fetchDropdownCompletion(
  prefix: string,
  suffix: string,
  language: string,
  context: AIContext,
  signal?: AbortSignal,
  delayMs = 400
): Promise<any[]> {
  return new Promise((resolve) => {
    if (dropdownDebounceTimer) clearTimeout(dropdownDebounceTimer);
    if (dropdownAbortController) dropdownAbortController.abort();

    dropdownDebounceTimer = setTimeout(async () => {
      dropdownAbortController = new AbortController();
      
      const combinedSignal = signal || dropdownAbortController.signal;
      // If external signal is aborted while waiting
      if (combinedSignal.aborted) {
        resolve([]);
        return;
      }

      try {
        const response = await fetch(`${BASE_URL}/autocomplete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, suffix, language, context }),
          signal: combinedSignal,
        });

        if (!response.ok) {
          resolve([]);
          return;
        }

        const data = await response.json();
        resolve(data.items || []);
      } catch (error) {
        resolve([]);
      }
    }, delayMs);
  });
}
