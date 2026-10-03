import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ConversationEntry } from './ai/nluService';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ConversationEntry[];
}

const SESSIONS_DIR = path.join(__dirname, '..', 'storage', 'sessions');

class SessionService {
  constructor() {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  }

  private getFilePath(id: string): string {
    return path.join(SESSIONS_DIR, `${id}.json`);
  }

  async getAllSessions(): Promise<Omit<ChatSession, 'messages'>[]> {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    const sessions: Omit<ChatSession, 'messages'>[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf-8');
        const session: ChatSession = JSON.parse(content);
        sessions.push({
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        });
      } catch (e) {
        console.error(`Failed to read session file: ${file}`, e);
      }
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getSession(id: string): Promise<ChatSession | null> {
    const filePath = this.getFilePath(id);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.error(`Failed to read session ${id}`, e);
      return null;
    }
  }

  async createSession(title: string, messages: ConversationEntry[] = []): Promise<ChatSession> {
    const id = uuidv4();
    const now = Date.now();
    const session: ChatSession = {
      id,
      title: title || 'New Chat',
      createdAt: now,
      updatedAt: now,
      messages
    };

    fs.writeFileSync(this.getFilePath(id), JSON.stringify(session, null, 2));
    return session;
  }

  async updateSession(id: string, updates: Partial<ChatSession>): Promise<ChatSession | null> {
    const session = await this.getSession(id);
    if (!session) {
      return null;
    }

    const updatedSession: ChatSession = {
      ...session,
      ...updates,
      id: session.id, // ensure ID doesn't change
      updatedAt: Date.now()
    };

    fs.writeFileSync(this.getFilePath(id), JSON.stringify(updatedSession, null, 2));
    return updatedSession;
  }

  async deleteSession(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);
    if (!fs.existsSync(filePath)) {
      return false;
    }
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (e) {
      console.error(`Failed to delete session ${id}`, e);
      return false;
    }
  }

  async appendMessage(id: string, message: ConversationEntry): Promise<ChatSession | null> {
    const session = await this.getSession(id);
    if (!session) {
      return null;
    }
    session.messages.push(message);
    
    // Auto-update title if it's the first message and title is default
    if (session.messages.length === 1 && session.title === 'New Chat') {
      const text = message.content;
      session.title = text.length > 30 ? text.substring(0, 27) + '...' : text;
    }

    session.updatedAt = Date.now();
    fs.writeFileSync(this.getFilePath(id), JSON.stringify(session, null, 2));
    return session;
  }
}

export const sessionService = new SessionService();
