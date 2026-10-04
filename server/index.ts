import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envCandidates = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../../.env'),
];

for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}


import { createServer } from 'http';
import app from './app';
import { initSocketServer } from './socket/socketServer';

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);
httpServer.timeout = 600000; // 10 minutes for long LLM agent generations
httpServer.keepAliveTimeout = 600000;
httpServer.headersTimeout = 610000;
httpServer.requestTimeout = 600000;

initSocketServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`\n🚀 AI Web IDE Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO enabled`);
  console.log(`🤖 AI Provider: ${process.env.AI_PROVIDER || 'openai'}`);
  console.log(`📁 Workspace: ${process.env.WORKSPACE_ROOT || './storage/workspaces'}\n`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
