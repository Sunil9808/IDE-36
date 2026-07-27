import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import routes from './routes/productRoutes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;
app.use(cors({ origin: process.env.CLIENT_URL || 'http://127.0.0.1:5173' }));
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/products', routes);

async function start() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/product_inventory_dashboard');
  app.listen(port, () => console.log(`API running on http://127.0.0.1:${port}`));
}

start().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
