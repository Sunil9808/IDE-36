import { fileService } from '../fileService';
import { ExecutionPlan } from './RunnerRegistry';

export class ProjectManager {
    static async detectProjectType(workspacePath: string): Promise<string | null> {
        const tree = await fileService.getFileTree(workspacePath);
        const hasFile = (name: string) => tree.some(f => f.name === name);
        
        if (hasFile('package.json')) return 'npm';
        if (hasFile('pom.xml')) return 'maven';
        if (hasFile('build.gradle')) return 'gradle';
        if (hasFile('requirements.txt') || hasFile('pyproject.toml')) return 'python-project';
        if (hasFile('Cargo.toml')) return 'cargo';
        if (hasFile('go.mod')) return 'go-module';
        
        return null;
    }

    static async getProjectScripts(workspacePath: string): Promise<{ name: string, command: string }[]> {
        const type = await this.detectProjectType(workspacePath);
        if (type === 'npm') {
            try {
                const fileRes = await fileService.readFile(`${workspacePath}/package.json`);
const content = fileRes.content;
                const pkg = JSON.parse(content);
                if (pkg.scripts) {
                    return Object.keys(pkg.scripts).map(name => ({
                        name,
                        command: pkg.scripts[name]
                    }));
                }
            } catch (e) {
                // Ignore
            }
        }
        return [];
    }

    static async getProjectRunPlan(workspacePath: string, scriptName?: string): Promise<ExecutionPlan | null> {
        const type = await this.detectProjectType(workspacePath);
        
        if (type === 'npm') {
            return {
                command: 'npm',
                args: ['run', scriptName || 'start'],
                cwd: workspacePath
            };
        }
        if (type === 'maven') {
            return {
                command: 'mvn',
                args: ['spring-boot:run'],
                cwd: workspacePath
            };
        }
        if (type === 'cargo') {
            return {
                command: 'cargo',
                args: ['run'],
                cwd: workspacePath
            };
        }
        if (type === 'python-project') {
            return {
                command: 'python',
                args: ['main.py'], // Fallback assumption
                cwd: workspacePath
            };
        }
        return null;
    }
}
