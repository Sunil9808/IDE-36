export interface LanguageCapability {
  id: string;
  extensions: string[];
  executionMode: 'interpreter' | 'compile-run' | 'runtime' | 'browser-preview' | 'server' | 'project-script';
  checkCommand?: string;
  runCommandGenerator: (fileName: string, baseName: string) => string;
  requirementsName?: string;
}

export const languageRegistry: Record<string, LanguageCapability> = {
  python: {
    id: 'python',
    extensions: ['.py'],
    executionMode: 'interpreter',
    checkCommand: 'python --version',
    requirementsName: 'Python 3.x',
    runCommandGenerator: (f) => `python ${f}`
  },
  javascript: {
    id: 'javascript',
    extensions: ['.js'],
    executionMode: 'runtime',
    checkCommand: 'node --version',
    requirementsName: 'Node.js',
    runCommandGenerator: (f) => `node ${f}`
  },
  typescript: {
    id: 'typescript',
    extensions: ['.ts'],
    executionMode: 'compile-run',
    checkCommand: 'npx tsc --version',
    requirementsName: 'TypeScript Compiler (tsc)',
    runCommandGenerator: (f, b) => `npx tsc ${f} && node ${b}.js`
  },
  java: {
    id: 'java',
    extensions: ['.java'],
    executionMode: 'compile-run',
    checkCommand: 'javac -version',
    requirementsName: 'Java Development Kit (JDK)',
    runCommandGenerator: (f, b) => `javac ${f} && java ${b}`
  },
  cpp: {
    id: 'cpp',
    extensions: ['.cpp', '.cc', '.cxx'],
    executionMode: 'compile-run',
    checkCommand: 'g++ --version',
    requirementsName: 'G++ Compiler',
    runCommandGenerator: (f, b) => `g++ ${f} -o ${b} && node -e "require('child_process').spawnSync(process.platform==='win32'?'.\\\\${b}.exe':'./${b}', {stdio: 'inherit', shell: true})"`
  },
  c: {
    id: 'c',
    extensions: ['.c'],
    executionMode: 'compile-run',
    checkCommand: 'gcc --version',
    requirementsName: 'GCC Compiler',
    runCommandGenerator: (f, b) => `gcc ${f} -o ${b} && node -e "require('child_process').spawnSync(process.platform==='win32'?'.\\\\${b}.exe':'./${b}', {stdio: 'inherit', shell: true})"`
  },
  csharp: {
    id: 'csharp',
    extensions: ['.cs'],
    executionMode: 'compile-run',
    checkCommand: 'csc -help',
    requirementsName: '.NET SDK',
    runCommandGenerator: (f, b) => `csc ${f} && node -e "require('child_process').spawnSync(process.platform==='win32'?'.\\\\${b}.exe':'./${b}', {stdio: 'inherit', shell: true})"`
  },
  go: {
    id: 'go',
    extensions: ['.go'],
    executionMode: 'compile-run',
    checkCommand: 'go version',
    requirementsName: 'Go Toolchain',
    runCommandGenerator: (f) => `go run ${f}`
  },
  rust: {
    id: 'rust',
    extensions: ['.rs'],
    executionMode: 'compile-run',
    checkCommand: 'rustc --version',
    requirementsName: 'Rust Toolchain',
    runCommandGenerator: (f, b) => `rustc ${f} && node -e "require('child_process').spawnSync(process.platform==='win32'?'.\\\\${b}.exe':'./${b}', {stdio: 'inherit', shell: true})"`
  },
  html: {
    id: 'html',
    extensions: ['.html'],
    executionMode: 'browser-preview',
    runCommandGenerator: () => ''
  }
};

export function detectLanguageFromExtension(fileName: string): LanguageCapability | null {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  for (const lang of Object.values(languageRegistry)) {
    if (lang.extensions.includes(ext)) {
      return lang;
    }
  }
  return null;
}
