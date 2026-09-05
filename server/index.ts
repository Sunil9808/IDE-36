import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import { createServer } from 'http';
import app from './app';
import { initSocketServer } from './socket/socketServer';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);
initSocketServer(httpServer);

httpServer.listen(PORT, () => {
  logger.info(`\n🚀 AI Web IDE Server running on http://localhost:${PORT}`);
  logger.info(`📡 Socket.IO enabled`);
  logger.info(`🤖 AI Provider: ${process.env.AI_PROVIDER || 'openai'}`);
  logger.info(`📁 Workspace: ${process.env.WORKSPACE_ROOT || './storage/workspaces'}\n`);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err instanceof Error ? err.stack || err.message : String(err)}`);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
});
