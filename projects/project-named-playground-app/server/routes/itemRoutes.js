import { Router } from 'express';

const router = Router();
let items = [];
router.get('/', (_req, res) => res.json(items));
router.post('/', (req, res) => { const item = { id: Date.now().toString(), name: req.body.name || 'Untitled' }; items = [item, ...items]; res.status(201).json(item); });
router.put('/:id', (req, res) => { items = items.map((item) => item.id === req.params.id ? { ...item, ...req.body } : item); res.json(items.find((item) => item.id === req.params.id)); });
router.delete('/:id', (req, res) => { items = items.filter((item) => item.id !== req.params.id); res.json({ success: true }); });
export default router;
