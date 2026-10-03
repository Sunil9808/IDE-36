import { create } from 'zustand';
import axios from 'axios';
import { useUIStore } from './uiStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface CommitEntry {
  id: string;
  message: string;
  files: string[];
  timestamp: number;
}

interface SourceControlStore {
  initialized: boolean;
  published: boolean;
  remoteUrl: string | null;
  branch: string;
  stagedFiles: string[];
  commits: CommitEntry[];
  refresh: () => Promise<void>;
  initializeRepository: () => Promise<void>;
  publishRepository: (remoteUrl: string) => void;
  stageFile: (filePath: string) => Promise<void>;
  unstageFile: (filePath: string) => Promise<void>;
  stageFiles: (filePaths: string[]) => Promise<void>;
  unstageAll: () => Promise<void>;
  commit: (message: string, files: string[]) => Promise<void>;
}

export const useSourceControlStore = create<SourceControlStore>((set, get) => ({
  initialized: false,
  published: false,
  remoteUrl: null,
  branch: 'main',
  stagedFiles: [],
  commits: [],

  refresh: async () => {
    try {
      const res = await axios.get(`${API_URL}/git/status`);
      if (res.data.initialized) {
        const logRes = await axios.get(`${API_URL}/git/log`);
        set({
          initialized: true,
          branch: res.data.branch || 'main',
          stagedFiles: res.data.staged || [],
          commits: logRes.data.commits || [],
        });
      } else {
        set({
          initialized: false,
          branch: 'main',
          stagedFiles: [],
          commits: [],
        });
      }
    } catch (err: any) {
      console.error('Failed to fetch git status:', err);
    }
  },

  initializeRepository: async () => {
    try {
      await axios.post(`${API_URL}/git/init`);
      useUIStore.getState().addNotification({ type: 'success', message: 'Initialized Git repository' });
      await get().refresh();
    } catch (err: any) {
      useUIStore.getState().addNotification({ type: 'error', message: err.response?.data?.error || 'Failed to initialize repo' });
    }
  },

  publishRepository: (remoteUrl) => set({ initialized: true, published: true, remoteUrl }),

  stageFile: async (filePath) => {
    try {
      await axios.post(`${API_URL}/git/stage`, { files: [filePath] });
      await get().refresh();
    } catch (err: any) {
      useUIStore.getState().addNotification({ type: 'error', message: err.response?.data?.error || 'Failed to stage file' });
    }
  },

  unstageFile: async (filePath) => {
    try {
      await axios.post(`${API_URL}/git/unstage`, { files: [filePath] });
      await get().refresh();
    } catch (err: any) {
      useUIStore.getState().addNotification({ type: 'error', message: err.response?.data?.error || 'Failed to unstage file' });
    }
  },

  stageFiles: async (filePaths) => {
    try {
      await axios.post(`${API_URL}/git/stage`, { files: filePaths });
      await get().refresh();
    } catch (err: any) {
      useUIStore.getState().addNotification({ type: 'error', message: err.response?.data?.error || 'Failed to stage files' });
    }
  },

  unstageAll: async () => {
    try {
      await axios.post(`${API_URL}/git/unstage`, { files: 'all' });
      await get().refresh();
    } catch (err: any) {
      useUIStore.getState().addNotification({ type: 'error', message: err.response?.data?.error || 'Failed to unstage all' });
    }
  },

  commit: async (message, _files) => {
    try {
      await axios.post(`${API_URL}/git/commit`, { message });
      await get().refresh();
      useUIStore.getState().addNotification({ type: 'success', message: 'Committed successfully' });
    } catch (err: any) {
      useUIStore.getState().addNotification({ type: 'error', message: err.response?.data?.error || 'Failed to commit' });
    }
  },
}));
