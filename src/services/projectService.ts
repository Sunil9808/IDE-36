import axios from 'axios';

const BASE_URL = '/api/project';

export interface ProjectDetection {
  type: string;
  framework: string;
  root: string;
  commands: {
    install?: string;
    build?: string;
    start?: string;
    dev?: string;
  };
  preview?: {
    kind: 'server' | 'html';
    url?: string;
    filePath?: string;
  };
}

export interface ProjectProcess {
  id: string;
  command: string;
  cwd: string;
  url?: string;
  pid?: number;
  status: 'starting' | 'running' | 'exited' | 'error';
  output?: string;
}

export const projectService = {
  async detect(path?: string): Promise<ProjectDetection> {
    const { data } = await axios.get(`${BASE_URL}/detect`, { params: { path } });
    return data;
  },

  async start(path?: string, command?: string): Promise<ProjectProcess & { detection: ProjectDetection }> {
    const { data } = await axios.post(`${BASE_URL}/start`, { path, command });
    return data;
  },

  async stop(id: string): Promise<void> {
    await axios.post(`${BASE_URL}/stop`, { id });
  },

  async processes(): Promise<ProjectProcess[]> {
    const { data } = await axios.get(`${BASE_URL}/processes`);
    return data;
  },

  htmlPreviewUrl(filePath: string): string {
    return `${BASE_URL}/html-preview?path=${encodeURIComponent(filePath)}&t=${Date.now()}`;
  },
};
