import { Router, Request, Response } from 'express';
import {
  getGitStatus,
  initRepo,
  stageFiles,
  unstageFiles,
  commitChanges,
  getGitLog
} from '../services/gitService';

const router = Router();

router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await getGitStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/init', async (req: Request, res: Response) => {
  try {
    await initRepo();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/stage', async (req: Request, res: Response) => {
  try {
    const { files } = req.body;
    if (!files || (!Array.isArray(files) && files !== 'all')) {
      res.status(400).json({ error: 'files array or "all" string is required' });
      return;
    }
    await stageFiles(files);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/unstage', async (req: Request, res: Response) => {
  try {
    const { files } = req.body;
    if (!files || (!Array.isArray(files) && files !== 'all')) {
      res.status(400).json({ error: 'files array or "all" string is required' });
      return;
    }
    await unstageFiles(files);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/commit', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || message.trim() === '') {
      res.status(400).json({ error: 'Valid commit message is required' });
      return;
    }
    await commitChanges(message);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/log', async (req: Request, res: Response) => {
  try {
    const commits = await getGitLog();
    res.json({ commits });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
