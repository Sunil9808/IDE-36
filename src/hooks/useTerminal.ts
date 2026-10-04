import { useCallback } from 'react';
import { useTerminalStore } from '../store/terminalStore';
import { terminalService } from '../services/terminalService';
import { v4 as uuidv4 } from '../utils/uuid';

export function useTerminal() {
  const { sessions, activeSessionId, addSession, removeSession, setActiveSession, isVisible, setVisible } = useTerminalStore();

  const createSession = useCallback((shell = 'powershell.exe', cwd = '') => {
    const sessionId = uuidv4();
    terminalService.createSession({ sessionId, shell, cwd });
  }, []);

  const destroySession = useCallback((sessionId: string) => {
    terminalService.destroySession(sessionId);
    removeSession(sessionId);
  }, [removeSession]);

  const sendCommand = useCallback((sessionId: string, command: string) => {
    terminalService.sendData(sessionId, command + '\r');
  }, []);

  return {
    sessions,
    activeSessionId,
    isVisible,
    createSession,
    destroySession,
    sendCommand,
    setActiveSession,
    setVisible,
  };
}
