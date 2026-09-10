import { create } from 'zustand';

export interface Diagnostic {
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  source: string;
}

interface DiagnosticState {
  diagnostics: Diagnostic[];
  addDiagnostic: (d: Diagnostic) => void;
  setDiagnostics: (d: Diagnostic[]) => void;
  clearDiagnostics: () => void;
}

export const useDiagnosticStore = create<DiagnosticState>((set) => ({
  diagnostics: [],
  addDiagnostic: (d) => set((state) => ({ diagnostics: [...state.diagnostics, d] })),
  setDiagnostics: (d) => set({ diagnostics: d }),
  clearDiagnostics: () => set({ diagnostics: [] }),
}));
