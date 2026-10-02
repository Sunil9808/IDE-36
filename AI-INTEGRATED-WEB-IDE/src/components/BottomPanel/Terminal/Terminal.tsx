import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import 'xterm/css/xterm.css';
import {
  ChevronDown,
  ChevronUp,
  Copy,
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
import { useTerminalStore } from '../../../store/terminalStore';
import { v4 as uuidv4 } from '../../../utils/uuid';
import { TerminalProfile, TerminalSession } from '../../../types/terminal.types';

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
  return workspacePath || '';
}

function createSessionMetadata(cwd: string, profile: TerminalProfile = 'PowerShell', count = 1): TerminalSession {
  return {
    id: uuidv4(),
    name: `${profile}${count > 1 ? ` ${count}` : ''}`,
    profile,
    shell: PROFILES.find((p) => p.name === profile)?.shell || 'powershell.exe',
    cwd,
    isActive: true,
    isConnected: false,
    status: 'connecting',
    createdAt: Date.now(),
  };
}

interface ContextMenuState {
  x: number;
  y: number;
  visible: boolean;
}

export default function Terminal() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const { bottomPanelHeight, setBottomPanelHeight, bottomPanelVisible, setBottomPanelVisible } = useUIStore();
  const { sessions, activeSessionId, addSession, removeSession, setActiveSession, updateSession } = useTerminalStore();

  const terminalCwd = resolveTerminalCwd(workspace?.path);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ x: 0, y: 0, visible: false });

  // Terminal search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [searchResult, setSearchResult] = useState<{ resultIndex: number; resultCount: number }>({
    resultIndex: -1,
    resultCount: 0,
  });

  // Map storing instantiated xterm objects, fit addons & search addons per session ID
  const xtermInstancesRef = useRef<Map<string, { xterm: XTerm; fitAddon: FitAddon; searchAddon: SearchAddon }>>(new Map());
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Ensure at least one terminal session exists on mount
  useEffect(() => {
    if (sessions.length === 0) {
      const initial = createSessionMetadata(terminalCwd);
      addSession(initial);
    }
  }, [addSession, sessions.length, terminalCwd]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || sessions[0],
    [activeSessionId, sessions]
  );

  // Fit all active xterm instances
  const fitAll = useCallback(() => {
    xtermInstancesRef.current.forEach(({ fitAddon, xterm }, id) => {
      const elem = containerRefs.current.get(id);
      if (elem && elem.offsetParent !== null) {
        try {
          fitAddon.fit();
          if (id === activeSessionId) {
            terminalService.resizeTerminal(id, xterm.cols, xterm.rows);
          }
        } catch {
          // ignore layout transition errors
        }
      }
    });
  }, [activeSessionId]);

  useEffect(() => {
    const handleResize = () => {
      fitAll();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitAll]);

  useEffect(() => {
    if (bottomPanelVisible) {
      const timer = window.setTimeout(fitAll, 50);
      return () => window.clearTimeout(timer);
    }
  }, [bottomPanelHeight, fitAll, bottomPanelVisible]);

  // Connect socket once
  useEffect(() => {
    terminalService.connect();
  }, []);

  // Attach ResizeObserver to each terminal container element for automatic refitting
  useEffect(() => {
    const observers: Map<string, ResizeObserver> = new Map();

    containerRefs.current.forEach((container, id) => {
      const observer = new ResizeObserver(() => {
        const instance = xtermInstancesRef.current.get(id);
        if (instance && container.offsetParent !== null) {
          try {
            instance.fitAddon.fit();
            if (id === activeSessionId) {
              terminalService.resizeTerminal(id, instance.xterm.cols, instance.xterm.rows);
            }
          } catch {}
        }
      });
      observer.observe(container);
      observers.set(id, observer);
    });

    return () => {
      observers.forEach((obs) => obs.disconnect());
    };
  }, [sessions, activeSessionId]);

  // Initialize xterm for each session tab that doesn't have one yet
  useEffect(() => {
    sessions.forEach((session) => {
      if (xtermInstancesRef.current.has(session.id)) return;

      const container = containerRefs.current.get(session.id);
      if (!container) return;

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
      const searchAddon = new SearchAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(searchAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(container);

      // Listen for search result changes
      searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
        if (session.id === activeSessionId) {
          setSearchResult({ resultIndex, resultCount });
        }
      });

      // Keyboard handling inside terminal (Ctrl+F, Ctrl+Shift+C, Ctrl+Shift+V)
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== 'keydown') return true;

        if (e.ctrlKey && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          setSearchOpen(true);
          return false;
        }

        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
          const selection = term.getSelection();
          if (selection) {
            e.preventDefault();
            navigator.clipboard?.writeText(selection);
            return false;
          }
        }

        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') {
          e.preventDefault();
          navigator.clipboard?.readText().then((text) => {
            if (text) terminalService.sendData(session.id, text);
          });
          return false;
        }

        return true;
      });

      try {
        fitAddon.fit();
      } catch {}

      xtermInstancesRef.current.set(session.id, { xterm: term, fitAddon, searchAddon });

      // Request creation of PTY session on backend
      terminalService.createSession({
        sessionId: session.id,
        shell: session.shell,
        cwd: session.cwd,
        cols: term.cols || 80,
        rows: term.rows || 24,
      });

      // Stream user input from xterm to socket PTY
      term.onData((data) => {
        terminalService.sendData(session.id, data);
      });

      // Handle terminal resize from xterm UI
      term.onResize(({ cols, rows }) => {
        terminalService.resizeTerminal(session.id, cols, rows);
      });
    });
  }, [sessions, activeSessionId]);

  // Global socket event listeners with automatic unsubscribe cleanup
  useEffect(() => {
    const unsubData = terminalService.onData((data) => {
      const instance = xtermInstancesRef.current.get(data.sessionId);
      if (instance) {
        instance.xterm.write(data.data);
      }
    });

    const unsubCreated = terminalService.onSessionCreated((s) => {
      updateSession(s.id, {
        isConnected: Boolean(s.isConnected),
        status: s.isConnected ? 'connected' : 'fallback',
        statusMessage: s.isConnected ? `Connected to ${s.shell || s.name}` : 'Interactive PTY fallback active',
        cwd: s.cwd || terminalCwd,
      });

      const instance = xtermInstancesRef.current.get(s.id);
      if (instance) {
        window.setTimeout(() => {
          try {
            instance.fitAddon.fit();
            terminalService.resizeTerminal(s.id, instance.xterm.cols, instance.xterm.rows);
          } catch {}
        }, 50);
      }
    });

    const unsubClosed = terminalService.onSessionClosed((data) => {
      updateSession(data.sessionId, {
        isConnected: false,
        status: 'exited',
        statusMessage: `Process exited with code ${data.exitCode ?? 0}`,
      });
      const instance = xtermInstancesRef.current.get(data.sessionId);
      if (instance) {
        instance.xterm.writeln(`\r\n\x1b[33mTerminal process terminated (code ${data.exitCode ?? 0}). Press restart to launch a new session.\x1b[0m`);
      }
    });

    const unsubError = terminalService.onError((data) => {
      updateSession(data.sessionId, {
        isConnected: false,
        status: 'error',
        statusMessage: data.error,
      });
      const instance = xtermInstancesRef.current.get(data.sessionId);
      if (instance) {
        instance.xterm.writeln(`\r\n\x1b[31mTerminal Error: ${data.error}\x1b[0m`);
      }
    });

    return () => {
      unsubData();
      unsubCreated();
      unsubClosed();
      unsubError();
    };
  }, [terminalCwd, updateSession]);

  // Handle custom external terminal commands (e.g. from Explorer right click or AI Agent)
  useEffect(() => {
    const onTerminalCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; command?: string; cwd?: string; profile?: TerminalProfile }>).detail;

      if (detail?.action === 'new') {
        const count = sessions.length + 1;
        const targetCwd = detail.cwd ? resolveTerminalCwd(detail.cwd) : terminalCwd;
        const newSession = createSessionMetadata(targetCwd, detail.profile || 'PowerShell', count);
        addSession(newSession);
        setActiveSession(newSession.id);
        return;
      }

      if (detail?.command && activeSessionId) {
        terminalService.sendData(activeSessionId, `${detail.command}\r`);
        const instance = xtermInstancesRef.current.get(activeSessionId);
        if (instance) {
          instance.xterm.focus();
        }
      }
    };

    window.addEventListener('ai-web-ide:terminal-command', onTerminalCommand);
    return () => window.removeEventListener('ai-web-ide:terminal-command', onTerminalCommand);
  }, [activeSessionId, addSession, setActiveSession, sessions.length, terminalCwd]);

  // Keyboard Shortcuts (Ctrl+`, Ctrl+Shift+`, Ctrl+Shift+C)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        setBottomPanelVisible(!bottomPanelVisible);
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === '~' || e.key === '`')) {
        e.preventDefault();
        const count = sessions.length + 1;
        const newSession = createSessionMetadata(terminalCwd, 'PowerShell', count);
        addSession(newSession);
        setActiveSession(newSession.id);
        setBottomPanelVisible(true);
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        const activeInst = activeSessionId ? xtermInstancesRef.current.get(activeSessionId) : null;
        const selection = activeInst?.xterm.getSelection();
        if (selection) {
          e.preventDefault();
          navigator.clipboard?.writeText(selection);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addSession, bottomPanelVisible, setActiveSession, setBottomPanelVisible, sessions.length, activeSessionId, terminalCwd]);

  // Search logic handlers
  const handleFindNext = useCallback(
    (queryStr?: string) => {
      const query = queryStr !== undefined ? queryStr : searchTerm;
      if (!activeSessionId || !query) return;
      const instance = xtermInstancesRef.current.get(activeSessionId);
      if (instance?.searchAddon) {
        instance.searchAddon.findNext(query, {
          caseSensitive,
          wholeWord,
          regex: useRegex,
          incremental: true,
        });
      }
    },
    [activeSessionId, searchTerm, caseSensitive, wholeWord, useRegex]
  );

  const handleFindPrevious = useCallback(() => {
    if (!activeSessionId || !searchTerm) return;
    const instance = xtermInstancesRef.current.get(activeSessionId);
    if (instance?.searchAddon) {
      instance.searchAddon.findPrevious(searchTerm, {
        caseSensitive,
        wholeWord,
        regex: useRegex,
      });
    }
  }, [activeSessionId, searchTerm, caseSensitive, wholeWord, useRegex]);

  const closeSearch = () => {
    setSearchOpen(false);
    if (activeSessionId) {
      const instance = xtermInstancesRef.current.get(activeSessionId);
      instance?.searchAddon?.clearDecorations();
      instance?.xterm?.focus();
    }
  };

  const handleCreateSession = (profile: TerminalProfile = 'PowerShell') => {
    const count = sessions.filter((s) => s.profile === profile).length + 1;
    const newSession = createSessionMetadata(terminalCwd, profile, count);
    addSession(newSession);
    setActiveSession(newSession.id);
    setProfileMenuOpen(false);
  };

  const handleCloseSession = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    terminalService.destroySession(id);

    const instance = xtermInstancesRef.current.get(id);
    if (instance) {
      instance.searchAddon?.dispose();
      instance.fitAddon?.dispose();
      instance.xterm.dispose();
      xtermInstancesRef.current.delete(id);
    }
    containerRefs.current.delete(id);

    removeSession(id);
  };

  const handleRestartSession = () => {
    if (!activeSession) return;
    terminalService.destroySession(activeSession.id);

    const instance = xtermInstancesRef.current.get(activeSession.id);
    if (instance) {
      instance.xterm.clear();
      instance.xterm.writeln('\x1b[33mRestarting terminal session...\x1b[0m\r\n');
    }

    updateSession(activeSession.id, { status: 'connecting', isConnected: false });
    terminalService.createSession({
      sessionId: activeSession.id,
      shell: activeSession.shell,
      cwd: activeSession.cwd,
      cols: instance?.xterm.cols || 80,
      rows: instance?.xterm.rows || 24,
    });
  };

  const handleClearSession = () => {
    if (!activeSessionId) return;
    const instance = xtermInstancesRef.current.get(activeSessionId);
    if (instance) {
      instance.xterm.clear();
      instance.xterm.focus();
    }
  };

  const handleKillSession = () => {
    if (!activeSessionId) return;
    terminalService.killSession(activeSessionId);
  };

  const copySelection = async () => {
    if (!activeSessionId) return;
    const instance = xtermInstancesRef.current.get(activeSessionId);
    const selection = instance?.xterm.getSelection();
    if (selection) {
      await navigator.clipboard?.writeText(selection);
    }
  };

  const pasteFromClipboard = async () => {
    if (!activeSessionId) return;
    try {
      const text = await navigator.clipboard?.readText();
      if (text) {
        terminalService.sendData(activeSessionId, text);
      }
    } catch {}
  };

  const selectAllText = () => {
    if (!activeSessionId) return;
    const instance = xtermInstancesRef.current.get(activeSessionId);
    instance?.xterm.selectAll();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      style={{ background: '#181818' }}
      onClick={closeContextMenu}
    >
      {/* VS Code Terminal Tab & Toolbar Header */}
      <div
        className="flex h-8 flex-shrink-0 items-center justify-between border-b px-2 no-select"
        style={{ background: '#1e1e1e', borderColor: 'var(--color-border)' }}
      >
        {/* Terminal Tabs List */}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
          {sessions.map((session) => {
            const active = session.id === (activeSessionId || activeSession?.id);
            const statusColor =
              session.status === 'connected'
                ? '#4ec9b0'
                : session.status === 'error' || session.status === 'exited'
                ? '#f87171'
                : '#dcdcaa';

            return (
              <button
                key={session.id}
                title={`${session.name} (${session.shell}) - ${session.status}`}
                className="group relative flex h-7 min-w-[110px] max-w-[170px] items-center gap-1.5 rounded-t px-2 text-left text-xs transition-colors"
                style={{
                  background: active ? '#181818' : 'transparent',
                  color: active ? '#ffffff' : 'var(--color-textMuted)',
                  borderTop: active ? '2px solid var(--color-accent)' : '2px solid transparent',
                }}
                onClick={() => {
                  setActiveSession(session.id);
                  const inst = xtermInstancesRef.current.get(session.id);
                  if (inst) {
                    window.setTimeout(() => {
                      try {
                        inst.fitAddon.fit();
                        inst.xterm.focus();
                      } catch {}
                    }, 30);
                  }
                }}
              >
                <span className="font-mono text-[12px] font-bold" style={{ color: statusColor }}>
                  &gt;_
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{session.name}</span>
                <span
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ background: statusColor }}
                />
                <span
                  role="button"
                  tabIndex={0}
                  title="Close Terminal"
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded hover:bg-white/20 ${
                    active ? 'opacity-80 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(e) => handleCloseSession(session.id, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCloseSession(session.id);
                    }
                  }}
                >
                  <X size={11} />
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Toolbar Controls */}
        <div className="relative flex items-center gap-0.5 pl-2 flex-shrink-0">
          {/* New Terminal Dropdown */}
          <div className="relative flex items-center">
            <button
              title="New Terminal"
              className="flex h-6 items-center gap-0.5 rounded px-1 text-xs hover:bg-white/10"
              style={{ color: 'var(--color-text)' }}
              onClick={() => handleCreateSession()}
            >
              <Plus size={13} />
              <ChevronDown
                size={11}
                onClick={(e) => {
                  e.stopPropagation();
                  setProfileMenuOpen(!profileMenuOpen);
                }}
              />
            </button>
            {profileMenuOpen && (
              <div
                className="absolute right-0 top-7 z-50 w-48 rounded-md py-1 shadow-2xl"
                style={{ background: '#252526', border: '1px solid var(--color-border)' }}
              >
                {PROFILES.map((p) => (
                  <button
                    key={p.name}
                    className="flex h-7 w-full items-center justify-between px-3 text-left text-xs hover:bg-white/10"
                    style={{ color: 'var(--color-text)' }}
                    onClick={() => handleCreateSession(p.name)}
                  >
                    <span>{p.name}</span>
                    <span style={{ color: 'var(--color-textMuted)' }}>{p.executable}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <ToolbarBtn
            icon={<SplitSquareHorizontal size={13} />}
            title="Split Terminal"
            onClick={() => handleCreateSession(activeSession?.profile)}
          />
          <ToolbarBtn
            icon={<Search size={13} />}
            title="Search Terminal Output (Ctrl+F)"
            onClick={() => setSearchOpen((prev) => !prev)}
          />
          <ToolbarBtn
            icon={<Copy size={13} />}
            title="Copy Selection (Ctrl+Shift+C)"
            onClick={() => void copySelection()}
          />
          <ToolbarBtn
            icon={<Square size={12} />}
            title="Kill Terminal Process"
            onClick={handleKillSession}
          />
          <ToolbarBtn
            icon={<RotateCcw size={13} />}
            title="Restart Terminal"
            onClick={handleRestartSession}
          />
          <ToolbarBtn
            icon={<Trash2 size={13} />}
            title="Clear Terminal Output"
            onClick={handleClearSession}
          />
          <ToolbarBtn
            icon={bottomPanelHeight > 420 ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            title={bottomPanelHeight > 420 ? 'Restore Panel Size' : 'Maximize Panel'}
            onClick={() => setBottomPanelHeight(bottomPanelHeight > 420 ? 250 : 560)}
          />
        </div>
      </div>

      {/* Terminal Viewport */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ padding: '4px 0 4px 6px' }}
        onContextMenu={handleContextMenu}
      >
        {/* Interactive Search Bar Overlay */}
        {searchOpen && (
          <div
            className="absolute right-4 top-2 z-40 flex items-center gap-1.5 rounded-md p-1.5 shadow-2xl transition-all"
            style={{
              background: '#252526',
              border: '1px solid #454545',
            }}
          >
            <input
              type="text"
              autoFocus
              placeholder="Find..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                handleFindNext(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) handleFindPrevious();
                  else handleFindNext();
                } else if (e.key === 'Escape') {
                  closeSearch();
                }
              }}
              className="h-6 w-44 rounded bg-[#1e1e1e] px-2 text-xs text-white outline-none focus:ring-1 focus:ring-[#007acc]"
            />

            {/* Match Counter */}
            <span className="text-[11px] text-[#888888] min-w-[50px] text-center">
              {searchTerm
                ? searchResult.resultCount > 0
                  ? `${searchResult.resultIndex + 1} of ${searchResult.resultCount}`
                  : 'No results'
                : ''}
            </span>

            {/* Match Case Toggle */}
            <button
              title="Match Case"
              className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${
                caseSensitive ? 'bg-[#007acc] text-white' : 'text-[#cccccc] hover:bg-white/10'
              }`}
              onClick={() => setCaseSensitive(!caseSensitive)}
            >
              Aa
            </button>

            {/* Match Whole Word Toggle */}
            <button
              title="Match Whole Word"
              className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${
                wholeWord ? 'bg-[#007acc] text-white' : 'text-[#cccccc] hover:bg-white/10'
              }`}
              onClick={() => setWholeWord(!wholeWord)}
            >
              \b
            </button>

            {/* Use Regular Expression Toggle */}
            <button
              title="Use Regular Expression"
              className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${
                useRegex ? 'bg-[#007acc] text-white' : 'text-[#cccccc] hover:bg-white/10'
              }`}
              onClick={() => setUseRegex(!useRegex)}
            >
              .*
            </button>

            {/* Find Previous */}
            <button
              title="Previous Match (Shift+Enter)"
              className="flex h-5 w-5 items-center justify-center rounded text-[#cccccc] hover:bg-white/10"
              onClick={handleFindPrevious}
            >
              <ChevronUp size={13} />
            </button>

            {/* Find Next */}
            <button
              title="Next Match (Enter)"
              className="flex h-5 w-5 items-center justify-center rounded text-[#cccccc] hover:bg-white/10"
              onClick={() => handleFindNext()}
            >
              <ChevronDown size={13} />
            </button>

            {/* Close Search */}
            <button
              title="Close (Escape)"
              className="flex h-5 w-5 items-center justify-center rounded text-[#cccccc] hover:bg-white/10"
              onClick={closeSearch}
            >
              <X size={13} />
            </button>
          </div>
        )}

        {sessions.map((session) => {
          const isActive = session.id === (activeSessionId || activeSession?.id);
          return (
            <div
              key={session.id}
              ref={(el) => {
                if (el) containerRefs.current.set(session.id, el);
                else containerRefs.current.delete(session.id);
              }}
              style={{
                display: isActive ? 'block' : 'none',
                width: '100%',
                height: '100%',
                overflow: 'hidden',
              }}
            />
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="fixed z-50 w-44 rounded-md py-1 text-xs shadow-2xl"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#252526',
            border: '1px solid var(--color-border)',
          }}
        >
          <ContextMenuItem label="Copy" onClick={() => void copySelection()} />
          <ContextMenuItem label="Paste" onClick={() => void pasteFromClipboard()} />
          <ContextMenuItem label="Select All" onClick={selectAllText} />
          <ContextMenuItem label="Find..." onClick={() => setSearchOpen(true)} />
          <div className="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
          <ContextMenuItem label="Clear" onClick={handleClearSession} />
          <ContextMenuItem label="Restart Terminal" onClick={handleRestartSession} />
          <ContextMenuItem label="Kill Terminal" onClick={handleKillSession} />
        </div>
      )}
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

function ContextMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/10"
      style={{ color: 'var(--color-text)' }}
      onClick={() => onClick()}
    >
      {label}
    </button>
  );
}
