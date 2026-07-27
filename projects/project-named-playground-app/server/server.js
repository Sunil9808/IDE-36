import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes/itemRoutes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;
app.use(cors({ origin: process.env.CLIENT_URL || 'http://127.0.0.1:5173' }));
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/items', routes);

async function start() {
  app.listen(port, () => console.log(`API running on http://127.0.0.1:${port}`));
}

start().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
