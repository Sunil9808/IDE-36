import { create } from 'zustand';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  source: 'Backend' | 'Frontend' | 'AI';
  message: string;
}

interface OutputStore {
  logs: LogEntry[];
  addLog: (log: Omit<LogEntry, 'id'>) => void;
  clearLogs: () => void;
}

const generateId = () => {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
};

export const useOutputStore = create<OutputStore>((set) => ({
  logs: [],
  
  addLog: (log) =>
    set((state) => ({
      logs: [...state.logs, { ...log, id: generateId() }],
    })),
    
  clearLogs: () => set({ logs: [] }),
}));
