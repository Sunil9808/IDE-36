import { runtimeManager } from '../RuntimeManager';
import { fileService } from '../fileService';

export interface ExecutionPlan {
    command: string;
    args: string[];
    cwd: string;
    env?: Record<string, string>;
    shell?: boolean;
    buildRequired?: boolean;
}

export interface ValidationResult {
    valid: boolean;
    reason?: string;
}

export interface Runner {
    id: string;
    languages: string[];
    detect(context: any): Promise<boolean>;
    validate(context: any): Promise<ValidationResult>;
    build(context: any): Promise<ExecutionPlan | null>;
    run(context: any): Promise<ExecutionPlan>;
}

class RunnerRegistryManager {
    private runners: Map<string, Runner> = new Map();

    register(runner: Runner) {
        this.runners.set(runner.id, runner);
    }

    async getRunnerForLanguage(language: string, context: any): Promise<Runner | null> {
        for (const runner of this.runners.values()) {
            if (runner.languages.includes(language)) {
                const detected = await runner.detect(context);
                if (detected) return runner;
            }
        }
        return null;
    }
}

export const runnerRegistry = new RunnerRegistryManager();

// Built-in Runners
runnerRegistry.register({
    id: "python-builtin",
    languages: ["python"],
    async detect() { return true; },
    async validate() {
        const hasPython = runtimeManager.getRuntimes().find(r => r.id === 'python')?.status === 'available';
        return { valid: hasPython, reason: "Python runtime not found" };
    },
    async build() { return null; },
    async run(context) {
        return {
            command: "python",
            args: [context.fileName],
            cwd: context.workspaceRoot
        };
    }
});

runnerRegistry.register({
    id: "node-builtin",
    languages: ["javascript", "typescript"],
    async detect() { return true; },
    async validate() {
        const hasNode = runtimeManager.getRuntimes().find(r => r.id === 'node')?.status === 'available';
        return { valid: hasNode, reason: "Node.js runtime not found" };
    },
    async build() { return null; },
    async run(context) {
        if (context.language === 'typescript') {
            return {
                command: "npx",
                args: ["ts-node", context.fileName],
                cwd: context.workspaceRoot
            };
        }
        return {
            command: "node",
            args: [context.fileName],
            cwd: context.workspaceRoot
        };
    }
});

runnerRegistry.register({
    id: "java-builtin",
    languages: ["java"],
    async detect() { return true; },
    async validate() {
        const hasJava = runtimeManager.getRuntimes().find(r => r.id === 'java')?.status === 'available';
        return { valid: hasJava, reason: "Java runtime not found" };
    },
    async build(context) {
        return {
            command: "javac",
            args: [context.fileName],
            cwd: context.workspaceRoot,
            buildRequired: true
        };
    },
    async run(context) {
        const baseName = context.fileName.replace('.java', '');
        return {
            command: "java",
            args: [baseName],
            cwd: context.workspaceRoot
        };
    }
});

runnerRegistry.register({
    id: "cpp-builtin",
    languages: ["cpp", "c"],
    async detect() { return true; },
    async validate() {
        const hasGcc = runtimeManager.getRuntimes().find(r => r.id === 'gcc')?.status === 'available';
        return { valid: hasGcc, reason: "C/C++ compiler not found" };
    },
    async build(context) {
        const compiler = context.language === 'cpp' ? 'g++' : 'gcc';
        const out = context.fileName.replace(/\.(cpp|c)$/, '');
        return {
            command: compiler,
            args: [context.fileName, "-o", out],
            cwd: context.workspaceRoot,
            buildRequired: true
        };
    },
    async run(context) {
        const out = context.fileName.replace(/\.(cpp|c)$/, '');
        return {
            command: `./${out}`,
            args: [],
            cwd: context.workspaceRoot
        };
    }
});

runnerRegistry.register({
    id: "go-builtin",
    languages: ["go"],
    async detect() { return true; },
    async validate() {
        const hasGo = runtimeManager.getRuntimes().find(r => r.id === 'go')?.status === 'available';
        return { valid: hasGo, reason: "Go compiler not found" };
    },
    async build() { return null; },
    async run(context) {
        return {
            command: "go",
            args: ["run", context.fileName],
            cwd: context.workspaceRoot
        };
    }
});
