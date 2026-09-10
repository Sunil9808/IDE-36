import { LanguageCapability } from './LanguageRegistry';

export type ResolutionError = {
  type: string;
  title: string;
  message: string;
  required?: string;
  file?: string;
};

export class ExecutionResolver {
  
  static async checkCommandExists(command: string, cwd: string): Promise<boolean> {
    try {
      const res = await fetch('/api/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, cwd })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.exitCode === 0;
    } catch {
      return false;
    }
  }

  static async resolveDependencies(workspacePath: string): Promise<ResolutionError | null> {
    try {
      // Check if package.json exists
      const res = await fetch('/api/files/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `${workspacePath}/package.json` })
      });
      if (res.ok) {
        // We have package.json. Check node_modules.
        const nmRes = await fetch('/api/files/stat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: `${workspacePath}/node_modules` })
        });
        
        if (!nmRes.ok) {
          return {
            type: 'DEPENDENCY_MISSING',
            title: 'Project dependencies are not installed',
            message: 'This project contains package.json but node_modules was not found.',
            file: 'package.json'
          };
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  static async resolveLanguageRequirements(lang: LanguageCapability, cwd: string): Promise<ResolutionError | null> {
    if (!lang.checkCommand) return null; // No checks required
    
    const exists = await this.checkCommandExists(lang.checkCommand, cwd);
    if (!exists) {
      return {
        type: 'RUNTIME_NOT_FOUND',
        title: `${lang.requirementsName} not found`,
        message: `This file requires ${lang.requirementsName} to execute properly.`,
        required: lang.requirementsName,
      };
    }
    
    return null;
  }

  static async getProjectRunCommand(workspacePath: string): Promise<string | null> {
    try {
      const res = await fetch('/api/files/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `${workspacePath}/package.json` })
      });
      if (res.ok) {
        const data = await res.json();
        const pkg = JSON.parse(data.content);
        if (pkg.scripts?.dev) return 'npm run dev';
        if (pkg.scripts?.start) return 'npm start';
      }
    } catch (e) {
      // ignore
    }
    return null;
  }
}
