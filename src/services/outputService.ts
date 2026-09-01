import { terminalService } from './terminalService';
import { useOutputStore } from '../store/outputStore';

class OutputService {
  private handleLog = (data: any) => {
    if (data && data.level && data.source && data.message && data.timestamp) {
      useOutputStore.getState().addLog({
        level: data.level,
        source: data.source,
        message: data.message,
        timestamp: data.timestamp,
      });
    }
  };

  initialize(): void {
    const socket = terminalService.connect();
    socket.on('output:log', this.handleLog);
  }

  cleanup(): void {
    const socket = terminalService.getSocket();
    if (socket) {
      socket.off('output:log', this.handleLog);
    }
  }
}

export const outputService = new OutputService();
