import { Router, Request, Response, NextFunction } from 'express';
import { sessionService } from '../services/sessionService';

const router = Router();

// Get all sessions (metadata only)
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await sessionService.getAllSessions();
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

// Get a specific session with messages
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const session = await sessionService.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (error) {
    next(error);
  }
});

// Create a new session
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, messages = [] } = req.body;
    const session = await sessionService.createSession(title, messages);
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

// Update a session (title, etc)
router.patch('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const session = await sessionService.updateSession(req.params.id, req.body);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (error) {
    next(error);
  }
});

// Append a message to a session
router.post('/:id/messages', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { message } = req.body;
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    const session = await sessionService.appendMessage(req.params.id, message);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (error) {
    next(error);
  }
});

// Delete a session
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const success = await sessionService.deleteSession(req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
