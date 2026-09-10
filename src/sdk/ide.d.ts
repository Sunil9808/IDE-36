/**
 * AI Web IDE Extension API
 */
declare namespace vscode {
    export interface Disposable {
        dispose(): any;
    }

    export interface ExtensionContext {
        subscriptions: Disposable[];
        extensionPath: string;
        globalState: any;
        workspaceState: any;
    }

    export namespace languages {
        export function registerDocumentFormattingEditProvider(languageId: string, provider: any): Disposable;
        export function registerCompletionItemProvider(languageId: string, provider: any, ...triggerCharacters: string[]): Disposable;

        export function registerHoverProvider(selector: string, provider: any): Disposable;
        export function registerDefinitionProvider(selector: string, provider: any): Disposable;
        export function registerReferenceProvider(selector: string, provider: any): Disposable;
        export function registerRenameProvider(selector: string, provider: any): Disposable;
        export function registerCodeActionsProvider(selector: string, provider: any): Disposable;

        export function createDiagnosticCollection(name: string): any;
    }

    export namespace commands {
        export function registerCommand(command: string, callback: (...args: any[]) => any): Disposable;
        export function executeCommand(command: string, ...rest: any[]): Promise<any>;
    }

    export interface TerminalOptions {
        name?: string;
        cwd?: string;
        shellPath?: string;
    }

    export interface Terminal {
        name: string;
        show(): void;
        hide(): void;
        sendText(text: string, addNewLine?: boolean): void;
        dispose(): void;
    }

    export namespace window {
        export function showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
        export function showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;
        export function createTerminal(options?: TerminalOptions | string): Terminal;
    }

    export namespace workspace {
        export function getConfiguration(section?: string): any;
        export const fs: any;
        export const onDidChangeTextDocument: any;
    }

    export interface ProcessExecutionOptions {
        command: string;
        args?: string[];
        cwd?: string;
        env?: Record<string, string>;
    }

    export interface ProcessExecutionResult {
        exitCode: number;
        stdout: string;
        stderr: string;
    }

    export namespace process {
        export function execute(options: ProcessExecutionOptions): Promise<ProcessExecutionResult>;
    }

    export interface RunnerContext {
        filePath: string;
        workspaceRoot: string;
    }

    export interface ExecutionInfo {
        command: string;
        args: string[];
        cwd?: string;
    }

    export interface RunnerDefinition {
        id: string;
        languages: string[];
        canRun(context: RunnerContext): boolean;
        validate?(context: RunnerContext): Promise<string | undefined>; // Returns error message if invalid
        createExecution(context: RunnerContext): ExecutionInfo | Promise<ExecutionInfo>;
    }

    export namespace runners {
        export function registerRunner(runner: RunnerDefinition): Disposable;
    }

    export class Uri {
        static file(path: string): Uri;
    }
}
