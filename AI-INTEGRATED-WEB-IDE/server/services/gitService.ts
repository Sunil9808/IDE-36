import { spawn } from 'child_process';
import { getWorkspaceRoot, resolveWorkspacePath } from '../utils/workspaceRoot';

export interface GitCommit {
  id: string;
  message: string;
  timestamp: number;
  files: string[];
}

export interface GitStatus {
  initialized: boolean;
  branch: string;
  staged: string[];
  unstaged: string[];
}

function runGitCommand(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn git: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || `Git exited with code ${code}`));
      }
    });
  });
}

export async function isGitInitialized(cwd: string): Promise<boolean> {
  try {
    await runGitCommand(['rev-parse', '--is-inside-work-tree'], cwd);
    return true;
  } catch {
    return false;
  }
}

export async function getGitStatus(): Promise<GitStatus> {
  const cwd = getWorkspaceRoot();
  const initialized = await isGitInitialized(cwd);
  
  if (!initialized) {
    return { initialized: false, branch: '', staged: [], unstaged: [] };
  }

  let branch = 'main';
  try {
    branch = await runGitCommand(['branch', '--show-current'], cwd);
    if (!branch) branch = 'main';
  } catch {
    branch = 'main';
  }

  let statusOutput = '';
  try {
    statusOutput = await runGitCommand(['status', '--porcelain'], cwd);
  } catch (err) {
    console.error('Git status error', err);
  }

  const staged: string[] = [];
  const unstaged: string[] = [];

  if (statusOutput) {
    const lines = statusOutput.split('\n');
    for (const line of lines) {
      if (!line) continue;
      const x = line[0];
      const y = line[1];
      const filePath = line.substring(3).trim();

      const cleanPath = filePath.replace(/(^"|"$)/g, '').replace(/\\/g, '/');

      if (['M', 'A', 'D', 'R', 'C'].includes(x)) {
        staged.push(cleanPath);
      }
      
      if (['M', 'D', '?'].includes(y)) {
        unstaged.push(cleanPath);
      }
    }
  }

  return {
    initialized: true,
    branch,
    staged,
    unstaged,
  };
}

export async function initRepo(): Promise<void> {
  const cwd = getWorkspaceRoot();
  await runGitCommand(['init', '-b', 'main'], cwd);
}

export async function stageFiles(files: string[] | 'all'): Promise<void> {
  const cwd = getWorkspaceRoot();
  if (files === 'all') {
    await runGitCommand(['add', '.'], cwd);
  } else {
    const validPaths = files.map(file => resolveWorkspacePath(file));
    if (validPaths.length > 0) {
      await runGitCommand(['add', ...validPaths], cwd);
    }
  }
}

export async function unstageFiles(files: string[] | 'all'): Promise<void> {
  const cwd = getWorkspaceRoot();
  if (files === 'all') {
    await runGitCommand(['reset'], cwd);
  } else {
    const validPaths = files.map(file => resolveWorkspacePath(file));
    if (validPaths.length > 0) {
      await runGitCommand(['reset', '--', ...validPaths], cwd);
    }
  }
}

export async function commitChanges(message: string): Promise<void> {
  const cwd = getWorkspaceRoot();
  if (!message || message.trim() === '') {
    throw new Error('Commit message is required');
  }
  await runGitCommand(['commit', '-m', message], cwd);
}

export async function getGitLog(): Promise<GitCommit[]> {
  const cwd = getWorkspaceRoot();
  const initialized = await isGitInitialized(cwd);
  if (!initialized) return [];

  try {
    const logOutput = await runGitCommand(['log', '--pretty=format:%H|%s|%ct', '-n', '50'], cwd);
    if (!logOutput) return [];

    const commits: GitCommit[] = [];
    const lines = logOutput.split('\n');
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 3) {
        commits.push({
          id: parts[0],
          message: parts[1],
          timestamp: parseInt(parts[2], 10) * 1000,
          files: []
        });
      }
    }
    return commits;
  } catch (err) {
    return [];
  }
}
