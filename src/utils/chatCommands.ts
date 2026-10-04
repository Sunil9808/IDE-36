import { Book, CheckCircle, Code, FileCode, Play, Terminal, Trash2, Wand2, FileText, Layout, MousePointer2 } from 'lucide-react';

export const slashCommands = [
  { id: 'explain', label: '/explain', description: 'Explain the current file or selected code', icon: Book },
  { id: 'debug', label: '/debug', description: 'Find and fix bugs', icon: Terminal },
  { id: 'generate', label: '/generate', description: 'Generate new code', icon: Wand2 },
  { id: 'refactor', label: '/refactor', description: 'Refactor for better quality', icon: FileCode },
  { id: 'review', label: '/review', description: 'Code review', icon: CheckCircle },
  { id: 'test', label: '/test', description: 'Generate tests', icon: Code },
  { id: 'docs', label: '/docs', description: 'Generate documentation', icon: FileText },
  { id: 'clear', label: '/clear', description: 'Clear chat history', icon: Trash2 }
];

export const mentionTargets = [
  { id: 'file', label: '@file', description: 'Reference the current active file', icon: FileCode },
  { id: 'workspace', label: '@workspace', description: 'Reference the workspace context', icon: Layout },
  { id: 'selection', label: '@selection', description: 'Reference selected code', icon: MousePointer2 },
  { id: 'terminal', label: '@terminal', description: 'Reference terminal output', icon: Terminal }
];
