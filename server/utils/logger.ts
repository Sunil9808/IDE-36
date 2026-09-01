import { getIO } from '../socket/socketServer';

function emitLog(level: 'info' | 'warn' | 'error', message: string) {
  try {
    const io = getIO();
    if (io) {
      io.emit('output:log', {
        level,
        source: 'Backend',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    // Ignore if io is not initialized yet
  }
}

export const logger = {
  info: (message: string) => {
    console.log(message);
    emitLog('info', message);
  },
  warn: (message: string) => {
    console.warn(message);
    emitLog('warn', message);
  },
  error: (message: string) => {
    console.error(message);
    emitLog('error', message);
  },
};
