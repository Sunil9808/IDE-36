import { Router } from 'express';
import Product from '../models/Product.js';

const router = Router();
router.get('/', async (_req, res) => res.json(await Product.find().sort({ createdAt: -1 })));
router.post('/', async (req, res) => res.status(201).json(await Product.create({ name: req.body.name })));
router.put('/:id', async (req, res) => res.json(await Product.findByIdAndUpdate(req.params.id, req.body, { new: true })));
router.delete('/:id', async (req, res) => { await Product.findByIdAndDelete(req.params.id); res.json({ success: true }); });
export default router;
