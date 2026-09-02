import { useDiagnosticStore } from '../../store/diagnosticStore';

export class ErrorParser {
  static parseTerminalOutput(output: string) {
    const lines = output.split('\n');
    const store = useDiagnosticStore.getState();
    store.clearDiagnostics();

    for (const line of lines) {
      // Node.js Error: Error: Cannot find module 'express'
      if (line.includes('Error: Cannot find module')) {
        const moduleMatch = line.match(/'([^']+)'/);
        store.addDiagnostic({
          file: 'package.json',
          line: 1,
          message: `Module not found: ${moduleMatch?.[1] || 'unknown'}. Try running npm install.`,
          severity: 'error',
          source: 'Node'
        });
        continue;
      }

      // Python Error: File "main.py", line 14, in <module> \n NameError: name 'user' is not defined
      const pythonMatch = line.match(/File "([^"]+)", line (\d+)/);
      if (pythonMatch) {
        store.addDiagnostic({
          file: pythonMatch[1],
          line: parseInt(pythonMatch[2]),
          message: 'Python runtime error (see terminal for details)',
          severity: 'error',
          source: 'Python'
        });
        continue;
      }

      // C++ / GCC error: main.cpp:12:5: error: 'cout' was not declared in this scope
      const gccMatch = line.match(/^([^:]+):(\d+):(\d+):\s+(error|warning):\s+(.+)$/);
      if (gccMatch) {
        store.addDiagnostic({
          file: gccMatch[1],
          line: parseInt(gccMatch[2]),
          message: gccMatch[5],
          severity: gccMatch[4] === 'error' ? 'error' : 'warning',
          source: 'GCC'
        });
        continue;
      }

      // Java error: Main.java:14: error: cannot find symbol
      const javaMatch = line.match(/^([^:]+):(\d+):\s+(error|warning):\s+(.+)$/);
      if (javaMatch) {
        store.addDiagnostic({
          file: javaMatch[1],
          line: parseInt(javaMatch[2]),
          message: javaMatch[4],
          severity: javaMatch[3] === 'error' ? 'error' : 'warning',
          source: 'Javac'
        });
        continue;
      }
    }
  }
}
