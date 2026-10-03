import { localServerManager } from '../../../services/LocalServerManager';
import { useDiagnosticStore } from '../../../store/diagnosticStore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import {
  ChevronDown,
  Copy,
  FolderOpen,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  Search,
  Square,
  SplitSquareHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { terminalService } from '../../../services/terminalService';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { useUIStore } from '../../../store/uiStore';
import { useEditorStore } from '../../../store/editorStore';
import { fileService } from '../../../services/fileService';
import { getLanguageFromExtension } from '../../../utils/fileHelpers';
import { v4 as uuidv4 } from '../../../utils/uuid';

const IDE_ROOT_CWD = '';

type TerminalProfile = 'PowerShell' | 'Command Prompt' | 'Git Bash' | 'WSL' | 'Bash' | 'Node.js';

interface TerminalInstance {
  id: string;
  name: string;
  profile: TerminalProfile;
  cwd: string;
  isConnected: boolean;
  status: 'connecting' | 'connected' | 'fallback' | 'exited' | 'error';
  statusMessage?: string;
}

const PROFILES: Array<{ name: TerminalProfile; shell: string; executable: string }> = [
  { name: 'PowerShell', shell: 'powershell.exe', executable: 'powershell' },
  { name: 'Command Prompt', shell: 'cmd.exe', executable: 'cmd' },
  { name: 'Git Bash', shell: 'bash.exe', executable: 'bash' },
  { name: 'WSL', shell: 'wsl.exe', executable: 'wsl' },
  { name: 'Bash', shell: 'bash', executable: 'bash' },
  { name: 'Node.js', shell: 'node.exe', executable: 'node' },
];

function resolveTerminalCwd(workspacePath?: string) {
  if (workspacePath && /^[A-Za-z]:[\\/]/.test(workspacePath)) {
    return workspacePath.replace(/\//g, '\\');
  }

  if (workspacePath?.startsWith('\\\\')) {
    return workspacePath;
  }

  return workspacePath || IDE_ROOT_CWD;
}

function createTerminalInstance(cwd: string, profile: TerminalProfile = 'PowerShell', count = 1): TerminalInstance {
  return {
    id: uuidv4(),
    name: `${profile}${count > 1 ? ` ${count}` : ''}`,
    profile,
    cwd,
    isConnected: false,
    status: 'connecting',
  };
}

let cachedUserInfo: { username: string; hostname: string } | null = null;
async function fetchUserInfo() {
  if (cachedUserInfo) return cachedUserInfo;
  try {
    const res = await fetch('/api/terminal/userinfo');
    if (res.ok) cachedUserInfo = await res.json();
    else cachedUserInfo = { username: 'user', hostname: 'local' };
  } catch {
    cachedUserInfo = { username: 'user', hostname: 'local' };
  }
  return cachedUserInfo;
}

const branchCache = new Map<string, { branch: string | null; dirty: boolean }>();
async function fetchGitBranch(cwd: string) {
  try {
    const res = await fetch(`/api/terminal/gitinfo?cwd=${encodeURIComponent(cwd)}`);
    if (res.ok) {
      const data = await res.json();
      branchCache.set(cwd, data);
      return data;
    }
  } catch {}
  return { branch: null, dirty: false };
}

async function buildPrompt(profile: TerminalProfile, cwd: string): Promise<string> {
  const formatPath = (p: string) => {
    const normalized = p.replace(/\\/g, '/');
    const homeMatch = normalized.match(/^[a-zA-Z]:\/Users\/[^/]+/i);
    if (homeMatch) {
      return '~' + normalized.slice(homeMatch[0].length);
    }
    return normalized;
  };

  switch (profile) {
    case 'PowerShell':
      return `\x1b[34mPS \x1b[33m${cwd}\x1b[0m> `;
    case 'Command Prompt':
      return `\x1b[33m${cwd}\x1b[0m>`;
    case 'Node.js':
      return `\x1b[32m> \x1b[0m`;
    case 'Git Bash':
    case 'Bash':
    case 'WSL': {
      const { username, hostname } = (await fetchUserInfo()) || { username: 'user', hostname: 'host' };
      const { branch, dirty } = await fetchGitBranch(cwd);
      const isGitBash = profile === 'Git Bash';
      
      let p = `\x1b[1;32m${username}@${hostname} \x1b[0m`;
      if (isGitBash) p += `\x1b[1;35mMINGW64 \x1b[0m`;
      p += `\x1b[1;33m${formatPath(cwd)} \x1b[0m`;
      if (branch) {
        p += `\x1b[36m(${branch}${dirty ? '*' : ''}) \x1b[0m`;
      }
      p += `\r\n$ `;
      return p;
    }
    default:
      return `${profile} ${cwd}> `;
  }
}

export default function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketSessionRef = useRef<string | null>(null);
  const socketConnectedRef = useRef(false);
  const lineRef = useRef('');
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);
  const workspace = useWorkspaceStore((state) => state.workspace);
  const { bottomPanelHeight, setBottomPanelHeight } = useUIStore();
  const terminalCwd = resolveTerminalCwd(workspace?.path);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [instances, setInstances] = useState<TerminalInstance[]>(() => [createTerminalInstance(terminalCwd)]);
  const [activeId, setActiveId] = useState(() => instances[0].id);
  const [socketEpoch, setSocketEpoch] = useState(0);

  const activeInstance = useMemo(
    () => instances.find((instance) => instance.id === activeId) || instances[0],
    [activeId, instances]
  );

  const activeProfile = PROFILES.find((profile) => profile.name === activeInstance.profile) || PROFILES[0];
  const activeInstanceId = activeInstance.id;
  const activeInstanceCwd = activeInstance.cwd;
  const activeInstanceProfile = activeInstance.profile;
  const activeProfileName = activeProfile.name;
  const activeProfileShell = activeProfile.shell;

  const fitTimeoutRef = useRef<number | null>(null);
  const fit = useCallback(() => {
    if (fitTimeoutRef.current !== null) {
      window.clearTimeout(fitTimeoutRef.current);
    }
    fitTimeoutRef.current = window.setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
      } catch {
        // xterm can throw during intermediate layout states.
      }
    }, 30);
  }, []);

  const writePrompt = useCallback(async (overrideCwd?: string) => {
    const promptStr = await buildPrompt(activeInstanceProfile, overrideCwd || activeInstanceCwd);
    xtermRef.current?.write(promptStr);
  }, [activeInstanceProfile, activeInstanceCwd]);

  const resetLine = useCallback(async (nextLine = '') => {
    const term = xtermRef.current;
    if (!term) return;
    term.write('\x1b[2K\r');
    await writePrompt();
    lineRef.current = nextLine;
    term.write(nextLine);
  }, [writePrompt]);

  const clearTerminal = useCallback(async () => {
    const term = xtermRef.current;
    if (!term) return;
    term.clear();
    lineRef.current = '';
    await writePrompt();
    term.focus();
  }, [writePrompt]);

  const setActiveCwd = useCallback((cwd: string) => {
    setInstances((current) => current.map((instance) =>
      instance.id === activeId ? { ...instance, cwd } : instance
    ));
  }, [activeId]);

  const runCommand = useCallback((command: string) => {
    const term = xtermRef.current;
    if (!term) return;
    const trimmed = command.trim();
    if (!trimmed) return;

    historyRef.current = [trimmed, ...historyRef.current.filter((item) => item !== trimmed)].slice(0, 80);
    historyIndexRef.current = null;

    if (socketConnectedRef.current && socketSessionRef.current) {
      terminalService.sendData(socketSessionRef.current, `${trimmed}\r`);
      return;
    }

    term.write(trimmed);
    term.writeln('');
    void handleFallbackCommand(term, trimmed, activeInstance.cwd).then(async (nextCwd) => {
      if (nextCwd) setActiveCwd(nextCwd);
      lineRef.current = '';
      await writePrompt(nextCwd || activeInstance.cwd);
    }).catch(async () => {
      lineRef.current = '';
      await writePrompt();
    });
  }, [activeInstance.cwd, setActiveCwd, writePrompt]);

  useEffect(() => {
    const handleCd = (e: CustomEvent<string>) => {
      const targetCwd = e.detail;
      const termId = activeInstanceId || instances[0]?.id;
      const term = xtermRef.current;
      
      if (socketConnectedRef.current && socketSessionRef.current) {
        terminalService.sendData(termId, `cd "${targetCwd.replace(/"/g, '\\"')}"\r`);
      } else if (term) {
        void handleFallbackCommand(term, `cd "${targetCwd.replace(/"/g, '\\"')}"`, activeInstanceCwd).then(async (nextCwd) => {
          if (nextCwd) setActiveCwd(nextCwd);
          await writePrompt(nextCwd || activeInstanceCwd);
        });
      }
    };
    
    
    const handleRun = (e: CustomEvent<{ command: string, fileName: string, cwd?: string }>) => {
      const { command, fileName, cwd } = e.detail;
      const termId = activeInstanceId || instances[0]?.id;
      const term = xtermRef.current;
      
      const targetCwd = cwd || activeInstanceCwd;
      
      if (term) {
        term.writeln('');
        term.writeln(`\x1b[32m-  Running ${fileName}...\x1b[0m`);
      }
      
      if (socketConnectedRef.current && socketSessionRef.current) {
        const marker = '__AI_EXIT_CODE_=';
        let runCmd = command;
        
        if (cwd) {
           const safeCwd = cwd.replace(/"/g, '\\"');
           if (activeInstanceProfile === 'PowerShell') {
             runCmd = `Set-Location -Path "${safeCwd}"; ${command}`;
           } else if (activeInstanceProfile === 'Command Prompt') {
             runCmd = `cd /d "${safeCwd}" & ${command}`;
           } else {
             runCmd = `cd "${safeCwd}" && ${command}`;
           }
        }
        
        if (activeInstanceProfile === 'PowerShell') {
           runCmd = `${runCmd}; echo "${marker}$?"`;
        } else if (activeInstanceProfile === 'Command Prompt') {
           runCmd = `${runCmd} & echo ${marker}%ERRORLEVEL%`;
        } else if (activeInstanceProfile === 'Node.js') {
           runCmd = `${runCmd}`; // REPL, can't easily append shell commands
        } else {
           runCmd = `${runCmd}; echo "${marker}$?"`;
        }
        
        terminalService.sendData(termId, `${runCmd}\r`);
      } else if (term) {
        void handleFallbackCommand(term, command, targetCwd).then(async (nextCwd) => {
          if (nextCwd) setActiveCwd(nextCwd);
          await writePrompt(nextCwd || targetCwd);
          window.dispatchEvent(new CustomEvent('ai-web-ide:terminal-completed', { detail: { exitCode: 0 } }));
        });
      }
    };

    const handleStop = () => {
      const termId = activeInstanceId || instances[0]?.id;
      if (socketConnectedRef.current && socketSessionRef.current) {
        terminalService.sendData(termId, `\x03`);
        terminalService.sendData(termId, `echo "\\nProcess stopped by user"\r`);
      }
    };

    window.addEventListener('ai-web-ide:terminal-cd', handleCd as any);
    window.addEventListener('ai-web-ide:terminal-run', handleRun as any);
    window.addEventListener('ai-web-ide:terminal-stop', handleStop as any);
    
    return () => {
      window.removeEventListener('ai-web-ide:terminal-cd', handleCd as any);
      window.removeEventListener('ai-web-ide:terminal-run', handleRun as any);
      window.removeEventListener('ai-web-ide:terminal-stop', handleStop as any);
    };
  }, [activeInstanceId, instances, activeInstanceCwd, writePrompt, setActiveCwd]);

  const createInstance = useCallback((profile: TerminalProfile = activeInstance.profile) => {
    setInstances((current) => {
      const count = current.filter((instance) => instance.profile === profile).length + 1;
      const next = createTerminalInstance(terminalCwd, profile, count);
      setActiveId(next.id);
      return [...current, next];
    });
    setProfileMenuOpen(false);
  }, [activeInstance.profile, terminalCwd]);

  const closeInstance = useCallback((id: string) => {
    setInstances((current) => {
      if (current.length === 1) {
        const replacement = createTerminalInstance(terminalCwd, current[0].profile);
        setActiveId(replacement.id);
        return [replacement];
      }

      const index = current.findIndex((instance) => instance.id === id);
      const next = current.filter((instance) => instance.id !== id);
      if (activeId === id) {
        setActiveId(next[Math.max(0, index - 1)]?.id || next[0].id);
      }
      return next;
    });
  }, [activeId, terminalCwd]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      theme: {
        background: '#181818',
        foreground: '#cccccc',
        cursor: '#cccccc',
        cursorAccent: '#181818',
        black: '#181818',
        red: '#f44747',
        green: '#4ec9b0',
        yellow: '#dcdcaa',
        blue: '#569cd6',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#4ec9b0',
        brightYellow: '#dcdcaa',
        brightBlue: '#569cd6',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#d4d4d4',
        selectionBackground: '#264f78',
      },
      fontFamily: 'Cascadia Code, JetBrains Mono, Fira Code, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.32,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    // Custom File Link Provider
    term.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        const line = term.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true) || '';
        const match = line.match(/([a-zA-Z0-9_\-\.\/\\\\]+\.[a-zA-Z0-9]+)(?:",? line |:)(\d+)/);
        if (match) {
          const fileName = match[1];
          const lineNum = parseInt(match[2], 10);
          const startIndex = line.indexOf(match[0]);
          callback([{
            range: {
              start: { x: startIndex + 1, y: bufferLineNumber },
              end: { x: startIndex + 1 + match[0].length, y: bufferLineNumber }
            },
            text: match[0],
            activate: async (e, text) => {
              const workspace = useWorkspaceStore.getState().workspace;
              if (!workspace) return;
              try {
                // Try resolving as absolute relative to workspace
                const cleanFileName = fileName.replace(/^[\\/]+/, '');
                const absolutePath = `${workspace.path}/${cleanFileName}`;
                const fileContent = await fileService.readFile(absolutePath);
                const fileId = btoa(absolutePath).substring(0, 16);
                
                useEditorStore.getState().openTab({
                  id: `tab-${fileId}`,
                  fileId,
                  filePath: fileContent.path,
                  fileName: cleanFileName.split('/').pop() || cleanFileName,
                  language: getLanguageFromExtension(cleanFileName),
                  content: fileContent.content,
                  isDirty: false,
                  isPreview: false,
                  cursorPosition: { line: lineNum, column: 1 },
                });
              } catch (err) {
                console.error("Could not open file from terminal link:", text);
              }
            }
          }]);
        } else {
          callback(undefined);
        }
      }
    });

    term.open(terminalRef.current);
    xtermRef.current = term;
    term.focus();
    window.setTimeout(fit, 50);

    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [fit]);

  useEffect(() => {
    const socket = terminalService.connect();
    const bump = () => setSocketEpoch((value) => value + 1);
    socket.on('connect', bump);
    socket.on('disconnect', bump);
    socket.on('connect_error', bump);
    if (socket.connected) bump();
    return () => {
      socket.off('connect', bump);
      socket.off('disconnect', bump);
      socket.off('connect_error', bump);
    };
  }, []);

  useEffect(() => {
    const term = xtermRef.current;
    if (!term || !activeInstance) return;

    const socket = terminalService.getSocket();
    const sessionId = activeInstanceId;
    socketSessionRef.current = sessionId;
    socketConnectedRef.current = Boolean(socket?.connected);
    lineRef.current = '';
    historyIndexRef.current = null;
    term.clear();

    if (socket?.connected) {
      setInstances((current) => current.map((instance) =>
        instance.id === sessionId ? { ...instance, status: 'connecting', statusMessage: undefined } : instance
      ));
      socket.emit('terminal:create', {
        sessionId,
        shell: activeProfileShell,
        cwd: activeInstanceCwd,
        cols: term.cols,
        rows: term.rows,
      });

      
      const onData = (data: { sessionId: string; data: string }) => {
        if (data.sessionId === sessionId) {
          // Check for exit marker
          const str = data.data;
          const match = str.match(/__AI_EXIT_CODE_=([a-zA-Z0-9]+)/);
          if (match) {
             let exitCode = 0;
             const rawVal = match[1].toLowerCase();
             if (rawVal === 'true') exitCode = 0;
             else if (rawVal === 'false') exitCode = 1;
             else exitCode = parseInt(rawVal, 10) || 0;
             
             // Remove marker from output
             const clean = str.replace(/__AI_EXIT_CODE_=[a-zA-Z0-9]+\r?\n?/, '');
             if (clean) term.write(clean);
             
             term.writeln(`\r\n\x1b[${exitCode === 0 ? '32' : '31'}mProcess exited with code ${exitCode}\x1b[0m`);
             window.dispatchEvent(new CustomEvent('ai-web-ide:terminal-completed', { detail: { exitCode } }));
             return;
          }
          
          // Check for common compiler/linter error patterns
          // e.g. main.cpp:10:5: error: expected ';' before '}'
          // e.g. /path/to/file.js:4:1
          
          // Check for localhost URLs
          const urlMatch = str.match(/(http|https):\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/i);
          if (urlMatch) {
             const scheme = urlMatch[1].toLowerCase();
             const host = urlMatch[2] === '0.0.0.0' || urlMatch[2] === '127.0.0.1' ? 'localhost' : urlMatch[2];
             const port = parseInt(urlMatch[3], 10);
             const url = `${scheme}://${host}:${port}`;
             
             localServerManager.registerServer({
                id: `server-${port}`,
                workspaceId: 'local', // We could get real workspaceId from store
                projectRoot: activeInstanceCwd,
                command: 'Detected Server',
                port,
                host,
                url,
                status: 'running'
             });
          }

          const errMatch = str.match(/([a-zA-Z0-9_\-\./\\]+\.[a-zA-Z0-9]+):(\d+):(\d+):?\s*(error|warning|fatal)?:?\s*(.*)/i);
          if (errMatch) {
             const file = errMatch[1].split(/[\\/]/).pop() || errMatch[1];
             useDiagnosticStore.getState().addDiagnostic({
                file,
                line: parseInt(errMatch[2], 10),
                message: errMatch[5] || 'Terminal error',
                severity: (errMatch[4] && errMatch[4].toLowerCase() === 'warning') ? 'warning' : 'error',
                source: 'terminal'
             });
          }

          term.write(data.data);
        }
      };


      const onCreated = (session: { id: string; isConnected?: boolean; cwd?: string; shell?: string }) => {
        if (session.id !== sessionId) return;
        socketConnectedRef.current = Boolean(session.isConnected);
        setInstances((current) => current.map((instance) =>
          instance.id === sessionId
            ? {
                ...instance,
                cwd: session.cwd || instance.cwd,
                isConnected: Boolean(session.isConnected),
                status: session.isConnected ? 'connected' : 'fallback',
                statusMessage: session.isConnected ? `Connected to ${session.shell || activeProfileShell}` : 'Using HTTP command runner fallback',
              }
            : instance
        ));
        term.clear();
        if (!session.isConnected) {
          term.writeln('\x1b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
          term.writeln('\x1b[1;32m AI Web IDE Terminal \x1b[0m\x1b[90m[Version 1.0.0]\x1b[0m');
          term.writeln('\x1b[33m Interactive shell unavailable. Using HTTP command runner fallback.\x1b[0m');
          term.writeln('\x1b[90m Type \'help\' for available commands.\x1b[0m');
          term.writeln('\x1b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
          void writePrompt();
        }
        term.focus();
      };

      const onClosed = (data: { sessionId: string }) => {
        if (data.sessionId !== sessionId) return;
        socketConnectedRef.current = false;
        setInstances((current) => current.map((instance) =>
          instance.id === sessionId ? { ...instance, isConnected: false, status: 'exited', statusMessage: 'Process exited' } : instance
        ));
        term.writeln('');
        term.writeln('\x1b[33mTerminal process exited. Press restart to create a new session.\x1b[0m');
      };

      const onError = (data: { sessionId: string; error: string }) => {
        if (data.sessionId !== sessionId) return;
        socketConnectedRef.current = false;
        setInstances((current) => current.map((instance) =>
          instance.id === sessionId ? { ...instance, isConnected: false, status: 'fallback', statusMessage: data.error } : instance
        ));
        term.writeln(`\x1b[33m${data.error}\x1b[0m`);
      };

      socket.on('terminal:data', onData);
      socket.on('terminal:created', onCreated);
      socket.on('terminal:closed', onClosed);
      socket.on('terminal:error', onError);

      const dataDisposable = term.onData((data) => {
        if (socketConnectedRef.current) {
          socket.emit('terminal:data', { sessionId, data });
          return;
        }
        void handleLocalTerminalData(
          data,
          term,
          activeInstanceCwd,
          lineRef,
          historyRef,
          historyIndexRef,
          writePrompt,
          resetLine,
          setActiveCwd
        );
      });
      const resizeDisposable = term.onResize(({ cols, rows }) => {
        socket.emit('terminal:resize', { sessionId, cols, rows });
      });

      return () => {
        dataDisposable.dispose();
        resizeDisposable.dispose();
        socket.off('terminal:data', onData);
        socket.off('terminal:created', onCreated);
        socket.off('terminal:closed', onClosed);
        socket.off('terminal:error', onError);
        socket.emit('terminal:destroy', { sessionId });
      };
    }

    socketConnectedRef.current = false;
    setInstances((current) => current.map((instance) =>
      instance.id === sessionId ? { ...instance, isConnected: false } : instance
    ));
    term.writeln('\x1b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
    term.writeln(`\x1b[1;32m AI Web IDE Terminal \x1b[0m\x1b[90m[${activeProfileName} fallback]\x1b[0m`);
    term.writeln('\x1b[90m Type \'help\' for available commands.\x1b[0m');
    term.writeln('\x1b[1;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    void writePrompt();

    const dataDisposable = term.onData((data) => {
      if (data === '\r') {
        term.writeln('');
        const command = lineRef.current.trim();
        if (command) {
          historyRef.current = [command, ...historyRef.current.filter((item) => item !== command)].slice(0, 80);
          void handleFallbackCommand(term, command, activeInstanceCwd).then(async (nextCwd) => {
            if (nextCwd) setActiveCwd(nextCwd);
            lineRef.current = '';
            historyIndexRef.current = null;
            await writePrompt(nextCwd || activeInstanceCwd);
          }).catch(async () => {
            lineRef.current = '';
            historyIndexRef.current = null;
            await writePrompt();
          });
        } else {
          lineRef.current = '';
          historyIndexRef.current = null;
          void writePrompt();
        }
        return;
      }

      if (data === '\x7f') {
        if (lineRef.current.length > 0) {
          lineRef.current = lineRef.current.slice(0, -1);
          term.write('\b \b');
        }
        return;
      }

      if (data === '\x03') {
        term.write('^C');
        term.writeln('');
        lineRef.current = '';
        historyIndexRef.current = null;
        void writePrompt();
        return;
      }

      if (data === '\x1b[A') {
        if (!historyRef.current.length) return;
        const nextIndex = historyIndexRef.current === null
          ? 0
          : Math.min(historyRef.current.length - 1, historyIndexRef.current + 1);
        historyIndexRef.current = nextIndex;
        void resetLine(historyRef.current[nextIndex]);
        return;
      }

      if (data === '\x1b[B') {
        if (historyIndexRef.current === null) return;
        const nextIndex = historyIndexRef.current - 1;
        if (nextIndex < 0) {
          historyIndexRef.current = null;
          void resetLine('');
        } else {
          historyIndexRef.current = nextIndex;
          void resetLine(historyRef.current[nextIndex]);
        }
        return;
      }

      if (data >= ' ' || data === '\t') {
        lineRef.current += data;
        term.write(data);
      }
    });

    return () => dataDisposable.dispose();
  }, [
    activeId,
    activeInstanceCwd,
    activeInstanceId,
    activeProfileName,
    activeProfileShell,
    resetLine,
    setActiveCwd,
    socketEpoch,
    writePrompt,
  ]);

  useEffect(() => {
    const onTerminalCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; command?: string }>).detail;
      if (detail?.action === 'new') {
        createInstance();
        return;
      }
      if (detail?.command) {
        runCommand(detail.command);
      }
    };

    window.addEventListener('ai-web-ide:terminal-command', onTerminalCommand);
    return () => window.removeEventListener('ai-web-ide:terminal-command', onTerminalCommand);
  }, [createInstance, runCommand]);

  const copySelection = async () => {
    const selection = xtermRef.current?.getSelection();
    if (selection) await navigator.clipboard?.writeText(selection);
    xtermRef.current?.focus();
  };

  const restartActive = () => {
    const profile = activeInstance.profile;
    closeInstance(activeInstance.id);
    window.setTimeout(() => createInstance(profile), 0);
  };

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#181818' }}>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex h-9 flex-shrink-0 items-center gap-2 border-b px-3 no-select"
          style={{ background: '#181818', borderColor: 'var(--color-border)' }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {instances.map((instance) => {
              const active = instance.id === activeId;
              const statusColor = instance.status === 'connected'
                ? '#4ec9b0'
                : instance.status === 'error' || instance.status === 'exited'
                  ? '#f87171'
                  : '#dcdcaa';
              return (
                <button
                  key={instance.id}
                  className="group flex h-8 min-w-[132px] max-w-[220px] items-center gap-2 rounded-t px-2 text-left text-xs"
                  style={{
                    background: active ? '#1f1f1f' : 'transparent',
                    color: active ? 'var(--color-text)' : 'var(--color-textMuted)',
                    borderTop: active ? '1px solid var(--color-accent)' : '1px solid transparent',
                  }}
                  onClick={() => setActiveId(instance.id)}
                >
                  <span className="text-[15px] leading-none" style={{ color: statusColor }}>
                    &gt;_
                  </span>
                  <span className="min-w-0 flex-1 truncate">{instance.name}</span>
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: statusColor }}
                    title={instance.statusMessage || instance.status}
                  />
                  <span
                    role="button"
                    tabIndex={0}
                    className="flex h-4 w-4 items-center justify-center rounded opacity-0 hover:bg-white/10 group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeInstance(instance.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        closeInstance(instance.id);
                      }
                    }}
                  >
                    <X size={11} />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative flex items-center gap-1">
            <button
              title="New Terminal"
              className="flex h-6 items-center gap-1 rounded px-2 text-xs hover:bg-white/10"
              style={{ color: 'var(--color-text)' }}
              onClick={() => createInstance()}
            >
              <Plus size={14} />
              <ChevronDown size={12} onClick={(event) => {
                event.stopPropagation();
                setProfileMenuOpen((open) => !open);
              }} />
            </button>
            {profileMenuOpen && (
              <div
                className="absolute right-0 top-7 z-50 w-48 rounded-md py-1 shadow-2xl"
                style={{ background: '#252526', border: '1px solid var(--color-border)' }}
              >
                {PROFILES.map((profile) => (
                  <button
                    key={profile.name}
                    className="flex h-8 w-full items-center justify-between px-3 text-left text-xs hover:bg-white/10"
                    style={{ color: 'var(--color-text)' }}
                    onClick={() => createInstance(profile.name)}
                  >
                    <span>{profile.name}</span>
                    <span style={{ color: 'var(--color-textMuted)' }}>{profile.executable}</span>
                  </button>
                ))}
              </div>
            )}
            <ToolbarBtn icon={<SplitSquareHorizontal size={14} />} title="Split Terminal" onClick={() => createInstance(activeInstance.profile)} />
            <ToolbarBtn icon={<Search size={14} />} title="Find in Terminal" onClick={() => xtermRef.current?.focus()} />
            <ToolbarBtn icon={<Copy size={14} />} title="Copy Selection" onClick={() => void copySelection()} />
            <ToolbarBtn icon={<FolderOpen size={14} />} title="Print Working Directory" onClick={() => runCommand('pwd')} />
            <ToolbarBtn icon={<Square size={13} />} title="Send Ctrl+C" onClick={() => terminalService.sendData(activeInstance.id, '\x03')} />
            <ToolbarBtn icon={<RotateCcw size={14} />} title="Restart Terminal" onClick={restartActive} />
            <ToolbarBtn icon={<Trash2 size={14} />} title="Clear Terminal" onClick={clearTerminal} />
            <ToolbarBtn
              icon={bottomPanelHeight > 420 ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              title={bottomPanelHeight > 420 ? 'Restore Panel Size' : 'Maximize Panel'}
              onClick={() => setBottomPanelHeight(bottomPanelHeight > 420 ? 250 : 560)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden" style={{ padding: '8px 0 4px 8px' }}>
          <div ref={terminalRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10"
      style={{ color: 'var(--color-textMuted)' }}
    >
      {icon}
    </button>
  );
}

async function handleLocalTerminalData(
  data: string,
  term: XTerm,
  cwd: string,
  lineRef: { current: string },
  historyRef: { current: string[] },
  historyIndexRef: { current: number | null },
  writePrompt: (cwd?: string) => Promise<void>,
  resetLine: (nextLine?: string) => Promise<void>,
  setCwd: (cwd: string) => void
) {
  if (data === '\r') {
    term.writeln('');
    const command = lineRef.current.trim();
    let nextCwd;
    if (command) {
      historyRef.current = [command, ...historyRef.current.filter((item) => item !== command)].slice(0, 80);
      nextCwd = await handleFallbackCommand(term, command, cwd);
      if (nextCwd) setCwd(nextCwd);
    }
    lineRef.current = '';
    historyIndexRef.current = null;
    await writePrompt(nextCwd || cwd);
    return;
  }

  if (data === '\x7f') {
    if (lineRef.current.length > 0) {
      lineRef.current = lineRef.current.slice(0, -1);
      term.write('\b \b');
    }
    return;
  }

  if (data === '\x03') {
    term.write('^C');
    term.writeln('');
    lineRef.current = '';
    historyIndexRef.current = null;
    await writePrompt();
    return;
  }

  if (data === '\x1b[A') {
    if (!historyRef.current.length) return;
    const nextIndex = historyIndexRef.current === null
      ? 0
      : Math.min(historyRef.current.length - 1, historyIndexRef.current + 1);
    historyIndexRef.current = nextIndex;
    await resetLine(historyRef.current[nextIndex]);
    return;
  }

  if (data === '\x1b[B') {
    if (historyIndexRef.current === null) return;
    const nextIndex = historyIndexRef.current - 1;
    if (nextIndex < 0) {
      historyIndexRef.current = null;
      await resetLine('');
    } else {
      historyIndexRef.current = nextIndex;
      await resetLine(historyRef.current[nextIndex]);
    }
    return;
  }

  if (data >= ' ' || data === '\t') {
    lineRef.current += data;
    term.write(data);
  }
}

async function handleFallbackCommand(term: XTerm, cmd: string, cwd: string): Promise<string | undefined> {
  const command = cmd.trim();
  const parts = command.split(/\s+/);
  const name = parts[0]?.toLowerCase();

  switch (name) {
    case 'clear':
    case 'cls':
      term.clear();
      return;
    case 'cd':
      return await changeFallbackDirectory(term, command, cwd);
    case 'help':
      term.writeln('AI Web IDE terminal:');
      term.writeln('  Real shell mode: supports interactive commands through node-pty.');
      term.writeln('  Fallback mode: supports shell commands through /api/terminal/run.');
      term.writeln('  Built-ins: cls, clear, cd, pwd, help.');
      term.writeln('  Tasks: npm run dev, npm run build, npm test, npx, node, git, python, powershell, cmd.');
      return;
    default:
      await runBackendCommand(term, command, cwd);
  }
}

async function changeFallbackDirectory(term: XTerm, command: string, cwd: string) {
  const target = command.replace(/^cd\s*/i, '').trim() || '.';
  try {
    const response = await fetch('/api/terminal/cwd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd, target }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json() as { cwd: string };
    term.writeln(result.cwd);
    return result.cwd;
  } catch (error) {
    term.writeln(`\x1b[31mcd failed: ${error instanceof Error ? error.message : 'Unable to change directory'}\x1b[0m`);
    return undefined;
  }
}

async function runBackendCommand(term: XTerm, command: string, cwd: string) {
  const start = performance.now();
  // Try real-time SSE streaming first
  try {
    const response = await fetch('/api/terminal/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd }),
    });

    if (response.ok && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullOutput = '';
      let exitCode = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6)) as { type: string; text?: string; code?: number };
            if (payload.type === 'stdout' && payload.text) {
              term.write(payload.text.replace(/\r?\n/g, '\r\n'));
              fullOutput += payload.text;
            } else if (payload.type === 'stderr' && payload.text) {
              term.write(`\x1b[31m${payload.text.replace(/\r?\n/g, '\r\n')}\x1b[0m`);
              fullOutput += payload.text;
            } else if (payload.type === 'error' && payload.text) {
              term.writeln(`\x1b[33m${payload.text}\x1b[0m`);
              fullOutput += payload.text;
            } else if (payload.type === 'exit') {
              exitCode = payload.code ?? 0;
            }
          } catch { /* ignore malformed SSE */ }
        }
      }

      const duration = ((performance.now() - start) / 1000).toFixed(1);
      if (exitCode !== 0) {
        term.writeln(`\x1b[31m\r\nExited with code ${exitCode} (${duration}s)\x1b[0m`);
        window.dispatchEvent(new CustomEvent('ai-web-ide:parse-errors', { detail: fullOutput }));
      } else {
        term.writeln(`\x1b[90m\r\nDone in ${duration}s\x1b[0m`);
        window.dispatchEvent(new CustomEvent('ai-web-ide:parse-errors', { detail: fullOutput }));
      }
      return;
    }
  } catch {
    // SSE endpoint unavailable — fall through to legacy
  }

  // Legacy fallback: single-shot /run endpoint
  term.writeln('\x1b[90mRunning command...\x1b[0m');
  try {
    const response = await fetch('/api/terminal/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json() as { output?: string; exitCode?: number };
    const output = result.output || '(command completed with no output)\n';
    output.replace(/\r/g, '').split('\n').forEach((line) => term.writeln(line));
    const duration = ((performance.now() - start) / 1000).toFixed(1);

    if (result.exitCode && result.exitCode !== 0) {
      term.writeln(`\x1b[31mCommand exited with code ${result.exitCode} after ${duration}s\x1b[0m`);
    } else {
      term.writeln(`\x1b[90mDone in ${duration}s\x1b[0m`);
    }
    
    window.dispatchEvent(new CustomEvent('ai-web-ide:parse-errors', { detail: output }));
  } catch (error) {
    term.writeln('\x1b[33mBackend command runner is not connected.\x1b[0m');
    term.writeln(`\x1b[90m${error instanceof Error ? error.message : 'Start the backend server, reload the app, then run the command again.'}\x1b[0m`);
  }
}
