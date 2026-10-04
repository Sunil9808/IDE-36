export interface QuickIntentResult {
  intent: string;
  cleanedText: string;
  isQuestion: boolean;
}

const abbreviations: Record<string, string> = {
  'plz': 'please',
  'pls': 'please',
  'thx': 'thanks',
  'u': 'you',
  'ur': 'your',
  'msg': 'message',
  'err': 'error',
  'func': 'function',
  'config': 'configuration',
  'repo': 'repository',
  'init': 'initialize',
  'env': 'environment',
  'cmd': 'command',
  'dir': 'directory',
  'db': 'database',
  'btn': 'button',
  'nav': 'navigation',
  'auth': 'authentication',
  'proj': 'project',
  'docs': 'documentation'
};

const typos: Record<string, string> = {
  'creat': 'create',
  'foldr': 'folder',
  'pakage': 'package',
  'javscript': 'javascript',
  'pyhton': 'python',
  'compnent': 'component',
  'datbase': 'database',
  'reat': 'react',
  'instal': 'install',
  'functon': 'function',
  'modl': 'model',
  'typscrpt': 'typescript',
  'delet': 'delete',
  'refactr': 'refactor',
  'eror': 'error',
  'tpe': 'type',
  'interfac': 'interface',
  'improt': 'import',
  'exprot': 'export',
  'modul': 'module',
  'compoent': 'component',
  'componet': 'component',
  'mising': 'missing',
  'invald': 'invalid',
  'undefind': 'undefined',
  'null': 'null',
  'strng': 'string',
  'boolea': 'boolean',
  'objct': 'object',
  'arrry': 'array',
  'methd': 'method',
  'clss': 'class',
  'styl': 'style',
  'layot': 'layout',
  'bacground': 'background',
  'color': 'color',
  'mrgain': 'margin',
  'padin': 'padding',
  'border': 'border',
  'wdith': 'width',
  'hight': 'height',
  'dsplay': 'display',
  'postin': 'position',
  'algn': 'align',
  'cntr': 'center',
  'jusify': 'justify',
  'animtion': 'animation',
  'trnsition': 'transition',
  'opcity': 'opacity',
  'vistble': 'visible',
  'hiddn': 'hidden',
  'absolut': 'absolute',
  'reltive': 'relative',
  'fixd': 'fixed',
  'stiky': 'sticky',
  'blok': 'block',
  'inlin': 'inline',
  'flx': 'flex',
  'grid': 'grid',
  'respnsve': 'responsive',
  'moble': 'mobile',
  'desktp': 'desktop',
  'scrn': 'screen',
  'brwser': 'browser',
  'windw': 'window',
  'docment': 'document',
  'elemnt': 'element',
  'attrbte': 'attribute',
  'prop': 'property',
  'val': 'value',
  'var': 'variable',
  'const': 'constant',
  'let': 'let',
  'retun': 'return',
  'if': 'if',
  'els': 'else',
  'for': 'for',
  'whil': 'while',
  'do': 'do',
  'swich': 'switch',
  'case': 'case',
  'break': 'break',
  'contin': 'continue',
  'defult': 'default',
  'try': 'try',
  'catch': 'catch',
  'finaly': 'finally',
  'throw': 'throw',
  'new': 'new',
  'this': 'this',
  'supr': 'super',
  'extend': 'extends',
  'implemnts': 'implements',
  'publc': 'public',
  'privat': 'private',
  'protcted': 'protected',
  'sttic': 'static',
  'redonly': 'readonly',
  'abstrct': 'abstract',
  'async': 'async',
  'await': 'await',
  'yild': 'yield',
  'genrator': 'generator'
};

const questionIntents = new Set([
  'what', 'why', 'how', 'when', 'where', 'who', 'explain', 'describe', 'tell', 'compare', 'difference', 'is', 'are', 'can', 'could', 'does'
]);

const actionIntents = new Set([
  'create', 'make', 'build', 'add', 'edit', 'modify', 'fix', 'delete', 'remove', 'rename', 'refactor', 'debug', 'optimize', 'install', 'test', 'deploy', 'run', 'generate', 'review', 'convert', 'document'
]);

const greetings = new Set([
  'hi', 'hello', 'hey', 'hii', 'hiii', 'yo', 'sup', 'howdy', 'greetings', 'morning', 'evening', 'afternoon', 'thanks', 'thank', 'bye', 'goodbye', 'ok', 'okay', 'sure', 'yes', 'no', 'yeah', 'nah', 'cool', 'nice', 'great', 'awesome', 'perfect', 'good', 'fine', 'alright'
]);

export function cleanInput(text: string): string {
  if (!text) return '';
  let cleaned = text.toLowerCase();
  
  // Normalize repeated chars (e.g. plzzz -> plz)
  cleaned = cleaned.replace(/(.)\1{2,}/g, '$1$1');
  
  // Remove excessive punctuation
  cleaned = cleaned.replace(/[!?.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Expand abbreviations
  const words = cleaned.split(/\s+/);
  const expanded = words.map(w => abbreviations[w] || w);
  
  return expanded.join(' ');
}

export function quickIntentCheck(text: string): QuickIntentResult {
  const cleanedTextBase = cleanInput(text);
  
  const words = cleanedTextBase.split(/\s+/);
  
  // Apply typo correction
  const correctedWords = words.map(w => typos[w] || w);
  const cleanedText = correctedWords.join(' ');
  
  if (correctedWords.length <= 3 && greetings.has(correctedWords[0])) {
    return { intent: 'greeting', cleanedText, isQuestion: true };
  }
  
  let intent = 'unknown';
  let isQuestion = false;
  
  // Detect action intent first
  for (const word of correctedWords) {
    if (actionIntents.has(word)) {
      intent = word;
      break;
    }
  }
  
  // Detect question intent
  for (const word of correctedWords) {
    if (questionIntents.has(word)) {
      isQuestion = true;
      if (intent === 'unknown') {
        intent = 'question';
      }
      break;
    }
  }
  
  return {
    intent,
    cleanedText,
    isQuestion
  };
}
