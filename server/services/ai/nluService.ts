import { AIContext } from './aiService';

export interface NLUResult {
  originalInput: string;
  cleanedInput: string;
  correctedInput: string;
  intent: NLUIntent;
  confidence: number;
  entities: NLUEntities;
  needsClarification: boolean;
  clarificationMessage?: string;
  executionPlan: string[];
  isDestructive: boolean;
}

export type NLUIntent =
  | 'create' | 'edit' | 'delete' | 'rename'
  | 'explain' | 'refactor' | 'debug' | 'optimize'
  | 'generate' | 'search' | 'build' | 'run'
  | 'install' | 'test' | 'deploy' | 'review'
  | 'convert' | 'translate' | 'document'
  | 'question' | 'unknown';

export interface NLUEntities {
  frameworks: string[];
  languages: string[];
  files: string[];
  folders: string[];
  features: string[];
  packages: string[];
}

export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const TYPO_DICT: Record<string, string> = {
  creat: 'create', foldr: 'folder', pakage: 'package', javscript: 'javascript',
  pyhton: 'python', expres: 'express', compnent: 'component', datbase: 'database',
  reat: 'react', nde: 'node', instal: 'install', imprt: 'import', functon: 'function',
  srver: 'server', rout: 'route', modl: 'model', contrlr: 'controller', middlewar: 'middleware',
  templt: 'template', complie: 'compile', depndency: 'dependency', configuratn: 'configuration',
  navigatn: 'navigation', authentcatn: 'authentication', dashbord: 'dashboard',
  resposive: 'responsive', animatn: 'animation', validatn: 'validation',
  typscrpt: 'typescript', mongdb: 'mongodb', postgressql: 'postgresql',
  apllication: 'application', delet: 'delete', modfiy: 'modify', refactr: 'refactor',
  deplyment: 'deployment', endpont: 'endpoint', databse: 'database', intergrate: 'integrate',
  framwork: 'framework', librry: 'library', repositry: 'repository', dependncy: 'dependency',
  extensin: 'extension', notificatn: 'notification', authorizatn: 'authorization',
  componnt: 'component', reder: 'render', stae: 'state', prps: 'props', efect: 'effect',
  hok: 'hook', contxt: 'context', provdr: 'provider', reducr: 'reducer', dispatc: 'dispatch',
  middlware: 'middleware', contrller: 'controller', routr: 'router', schem: 'schema',
  quer: 'query', mutatn: 'mutation', subscrptn: 'subscription', resolvr: 'resolver',
  tabel: 'table', colum: 'column', foriegn: 'foreign', primry: 'primary', indx: 'index',
  paswrd: 'password', usrname: 'username', emal: 'email', profle: 'profile',
  registratn: 'registration', loign: 'login', signup: 'signup', signout: 'signout',
  navbar: 'navbar', sidbar: 'sidebar', headr: 'header', footr: 'footer', layot: 'layout',
  buttn: 'button', drpdwn: 'dropdown', toltip: 'tooltip', carousl: 'carousel',
  accordn: 'accordion', breadcrmb: 'breadcrumb', paginatn: 'pagination', spinnr: 'spinner',
  tostr: 'toaster', alrt: 'alert', badg: 'badge', avtar: 'avatar', progres: 'progress',
  plz: 'please', thx: 'thanks', pls: 'please', u: 'you', ur: 'your', r: 'are', msg: 'message'
};

const CORPUS = [
  ...Object.values(TYPO_DICT),
  'app', 'project', 'file', 'directory', 'system', 'network', 'client', 'frontend', 'backend'
];

const INTENT_SYNONYMS: Record<NLUIntent, string[]> = {
  create: ['create', 'make', 'build', 'scaffold', 'init', 'initialize', 'new', 'generate', 'setup', 'start', 'add', 'craft', 'construct', 'produce', 'develop', 'implement', 'design', 'compose'],
  edit: ['edit', 'modify', 'change', 'update', 'fix', 'patch', 'adjust', 'tweak', 'alter', 'revise', 'correct', 'amend'],
  delete: ['delete', 'remove', 'rm', 'drop', 'destroy', 'clean', 'clear', 'purge', 'erase', 'wipe', 'uninstall', 'detach'],
  rename: ['rename', 'move', 'mv', 'relocate'],
  explain: ['explain', 'what', 'why', 'how', 'describe', 'tell', 'show', 'clarify', 'elaborate', 'detail', 'understand', 'mean'],
  refactor: ['refactor', 'clean', 'reorganize', 'restructure', 'simplify', 'decouple', 'decompose', 'extract', 'abstract', 'encapsulate'],
  debug: ['debug', 'fix', 'error', 'bug', 'issue', 'problem', 'broken', 'crash', 'failing', 'fault', 'defect', 'troubleshoot', 'diagnose', 'resolve'],
  optimize: ['optimize', 'fast', 'faster', 'speed', 'performance', 'improve', 'efficient', 'accelerate', 'enhance', 'boost', 'tune', 'benchmark'],
  generate: ['generate', 'scaffold', 'template', 'boilerplate', 'stub', 'skeleton', 'wireframe'],
  search: ['search', 'find', 'locate', 'lookup', 'grep', 'where', 'which', 'look'],
  build: ['build', 'compile', 'bundle', 'pack', 'assemble', 'make'],
  run: ['run', 'execute', 'start', 'launch', 'serve', 'boot', 'spin'],
  install: ['install', 'add', 'setup', 'configure', 'enable', 'activate'],
  test: ['test', 'spec', 'check', 'verify', 'validate', 'assert', 'expect', 'coverage', 'jest', 'mocha'],
  deploy: ['deploy', 'publish', 'release', 'ship', 'push', 'upload', 'host'],
  review: ['review', 'audit', 'inspect', 'examine', 'evaluate', 'assess', 'analyze', 'critique', 'check'],
  convert: ['convert', 'transform', 'translate', 'transpile', 'migrate', 'port', 'switch'],
  translate: ['translate', 'i18n', 'internationalize', 'localize', 'l10n'],
  document: ['document', 'doc', 'jsdoc', 'docstring', 'readme', 'comment', 'annotate', 'describe'],
  question: ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'is', 'are', 'can', 'could', 'would', 'should', 'does', 'do', 'will', 'has', 'have', 'explain', 'describe', 'tell', 'compare', 'difference'],
  unknown: []
};

const FOREIGN_VERBS: Record<string, NLUIntent> = {
  karo: 'create', karna: 'create', banao: 'create', banana: 'create', pannunga: 'create', pannu: 'create', seiyunga: 'create', seiyi: 'create', podu: 'create',
  hatao: 'delete',
  dikhao: 'explain', kaattunga: 'explain', edunga: 'explain',
  badlo: 'edit',
  chalao: 'run',
  lagao: 'install'
};

const FRAMEWORKS = ['react', 'reactjs', 'next', 'nextjs', 'next.js', 'angular', 'vue', 'vuejs', 'vue.js', 'svelte', 'nuxt', 'gatsby', 'remix', 'astro', 'express', 'expressjs', 'fastify', 'koa', 'hapi', 'nest', 'nestjs', 'django', 'flask', 'fastapi', 'spring', 'springboot', 'laravel', 'rails', 'ruby on rails'];
const LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'go', 'golang', 'rust', 'c', 'cpp', 'c++', 'csharp', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'dart', 'elixir', 'clojure', 'haskell', 'r', 'sql', 'html', 'css', 'sass', 'scss', 'less'];
const FEATURES = ['auth', 'authentication', 'login', 'signup', 'register', 'dashboard', 'navbar', 'navigation', 'sidebar', 'header', 'footer', 'dark mode', 'darkmode', 'theme', 'crud', 'api', 'rest', 'graphql', 'websocket', 'chat', 'todo', 'todolist', 'blog', 'ecommerce', 'cart', 'checkout', 'payment', 'search', 'filter', 'sort', 'pagination', 'upload', 'download', 'notification', 'profile', 'settings', 'admin', 'analytics'];

const DESTRUCTIVE_WORDS = ['remove all', 'delete everything', 'wipe', 'purge', 'destroy'];

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function cleanInput(input: string): string {
  let cleaned = input.toLowerCase();
  cleaned = cleaned.replace(/[!?.]+(?=$|\s)/g, '');
  cleaned = cleaned.replace(/([a-z])\1{2,}/g, '$1');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').map(w => TYPO_DICT[w] || w);
  return words.join(' ');
}

function correctTypos(input: string): string {
  return input.split(' ').map(word => {
    if (TYPO_DICT[word]) return TYPO_DICT[word];
    if (CORPUS.includes(word)) return word;
    if (word.length < 4) return word;
    let bestMatch = '';
    let minDistance = 3;
    let matchCount = 0;
    for (const term of CORPUS) {
      const d = levenshtein(word, term);
      if (d < minDistance) {
        minDistance = d;
        bestMatch = term;
        matchCount = 1;
      } else if (d === minDistance) {
        matchCount++;
      }
    }
    if (minDistance <= 2 && matchCount === 1) return bestMatch;
    return word;
  }).join(' ');
}

export function processNLU(rawInput: string, context: AIContext, conversationHistory: ConversationEntry[]): NLUResult {
  const cleanedInput = cleanInput(rawInput);
  const correctedInput = correctTypos(cleanedInput);
  
  const entities: NLUEntities = {
    frameworks: [],
    languages: [],
    files: [],
    folders: [],
    features: [],
    packages: []
  };

  const words = correctedInput.split(/\s+/);
  let detectedIntent: NLUIntent = 'unknown';
  let intentConfidence = 0;

  for (const [intent, synonyms] of Object.entries(INTENT_SYNONYMS)) {
    for (const word of words) {
      if (synonyms.includes(word)) {
        detectedIntent = intent as NLUIntent;
        intentConfidence = 0.9;
        break;
      }
    }
    if (detectedIntent !== 'unknown') break;
  }

  if (detectedIntent === 'unknown') {
    for (const word of words) {
      if (FOREIGN_VERBS[word]) {
        detectedIntent = FOREIGN_VERBS[word];
        intentConfidence = 0.8;
        break;
      }
    }
  }

  // Extract frameworks, languages, features
  for (const f of FRAMEWORKS) if (correctedInput.includes(f)) entities.frameworks.push(f);
  for (const l of LANGUAGES) if (correctedInput.includes(l)) entities.languages.push(l);
  for (const feat of FEATURES) if (correctedInput.includes(feat)) entities.features.push(feat);

  // Extract files and folders
  const fileRegex = /\b\w+[\w.-]*\.\w+\b/g;
  const fileMatches = correctedInput.match(fileRegex);
  if (fileMatches) entities.files.push(...fileMatches);
  
  const folderRegex = /\b[\w.-]+[/\\][\w.-]+\b/g;
  const folderMatches = correctedInput.match(folderRegex);
  if (folderMatches) entities.folders.push(...folderMatches);

  // Extract packages (after install/add)
  if (detectedIntent === 'install') {
    const installIndex = words.findIndex(w => w === 'install' || w === 'add');
    if (installIndex >= 0 && installIndex < words.length - 1) {
      entities.packages.push(words[installIndex + 1]);
    }
  }

  // Context & Memory
  let hasRecentCreate = false;
  let recentFramework = '';
  const recentHistory = conversationHistory.slice(-5);
  for (const entry of recentHistory) {
    if (entry.role === 'user' && (entry.content.includes('create') || entry.content.includes('make'))) {
      hasRecentCreate = true;
    }
    for (const f of FRAMEWORKS) {
      if (entry.content.toLowerCase().includes(f)) recentFramework = f;
    }
  }

  if (detectedIntent === 'unknown') {
    if (entities.frameworks.length > 0 || entities.features.length > 0) {
      detectedIntent = 'create';
      intentConfidence = 0.6;
    } else if (hasRecentCreate) {
      detectedIntent = 'create';
      intentConfidence = 0.5;
    }
  }

  if (entities.frameworks.length === 0 && recentFramework) {
    entities.frameworks.push(recentFramework);
  }

  let isDestructive = false;
  if (detectedIntent === 'delete') isDestructive = true;
  for (const w of DESTRUCTIVE_WORDS) {
    if (correctedInput.includes(w)) isDestructive = true;
  }

  let needsClarification = false;
  let clarificationMessage: string | undefined;

  const totalEntities = Object.values(entities).flat().length;
  if (intentConfidence < 0.4 && totalEntities === 0 && !hasRecentCreate) {
    needsClarification = true;
    clarificationMessage = "Could you please provide more details about what you'd like to do?";
  } else if (detectedIntent === 'create' && totalEntities === 0) {
    if (correctedInput === 'create app' || correctedInput === 'create project') {
      needsClarification = true;
      clarificationMessage = "Which framework would you like to use? React, Next.js, Vue, Angular, or another?";
    }
  }

  const executionPlan: string[] = [];
  if (detectedIntent === 'create') {
    if (entities.features.includes('navbar')) {
      executionPlan.push('Create responsive navigation bar with mobile hamburger menu');
    }
    if (entities.features.includes('dashboard')) {
      executionPlan.push('Create dashboard with sidebar, header, stat cards, and charts');
    }
    if (entities.features.includes('login') || correctedInput.includes('login page')) {
      executionPlan.push('Create login page component', 'Add form with email and password fields', 'Implement form validation', 'Add error handling and display', 'Add loading state', 'Style the login page', 'Update routing to include login page');
    } else if (entities.features.includes('todo') || correctedInput.includes('todo list')) {
      executionPlan.push('Create full CRUD todo app with add, edit, delete, mark complete, filter, search');
    } else if (correctedInput.includes('landing page')) {
      executionPlan.push('Create hero section, features, testimonials, CTA, footer');
    } else if (entities.features.includes('api')) {
      executionPlan.push('Create REST API with CRUD endpoints, validation, error handling');
    } else if (entities.frameworks.includes('react')) {
      executionPlan.push('Detect or create project directory', 'Initialize package.json with React dependencies', 'Create project structure (src/, public/, components/)', 'Create main App component', 'Create index entry point', 'Add basic styling', 'Configure build tools');
    } else {
      executionPlan.push(`Initialize ${entities.frameworks[0] || 'project'}`);
      executionPlan.push('Setup standard directory structure');
    }
  }

  let finalCorrectedInput = correctedInput;
  const lowerInput = finalCorrectedInput.toLowerCase();
  
  if (lowerInput.includes('find-s') || lowerInput.includes('find s')) {
    finalCorrectedInput = `User's Actual Request: "${correctedInput}"\n\n[SYSTEM OVERRIDE: The user is explicitly asking for the Machine Learning "Find-S" algorithm, which finds the most specific hypothesis from positive examples in a dataset. YOU MUST NOT WRITE A LINEAR SEARCH OR GENERIC STRING MATCHING ALGORITHM. WRITE ONLY THE MACHINE LEARNING ALGORITHM. IMPORTANT: You must write the code in the exact programming language the user requested. If the user did not specify a programming language, default to Python. (HINT FOR STANDARD IMPLEMENTATION: Use pure Python lists and dictionaries. Do NOT use pandas or external libraries. Your function should accept a full dataset. First, explicitly filter out and ignore negative examples by checking the target column precisely. Initialize your hypothesis to the first positive example using .copy(), explicitly delete the target column from the hypothesis dictionary, then use a simple loop to iterate through the remaining positive examples, replacing differing attributes with "?"). For your example dataset, use the classic "EnjoySport" textbook dataset (Sky, AirTemp, Humidity, Wind, PlayTennis) with "Yes"/"No" target labels. INCLUDE BOTH THE FUNCTION AND THE DATASET TOGETHER IN ONE SINGLE SCRIPT FILE. Do not separate them.]\n\nCRITICAL INSTRUCTION: DO NOT ask the user what they want to work on. DO NOT output a conversational greeting. Output the requested code IMMEDIATELY based on the user's request above.`;
  } else if (lowerInput.includes('pca algo') || lowerInput.includes('svm algo') || lowerInput.includes('knn algo') || lowerInput.match(/\b(pca|svm|knn|k-means|random forest) algorithm\b/)) {
    finalCorrectedInput += '\n\n[SYSTEM OVERRIDE: The user is asking for a Machine Learning algorithm. IMPORTANT: You must write the code in the exact programming language the user requested. If the user did not specify a programming language, default to Python as it is the industry standard for Data Science and ML.]';
  }

  return {
    originalInput: rawInput,
    cleanedInput,
    correctedInput: finalCorrectedInput,
    intent: detectedIntent,
    confidence: intentConfidence,
    entities,
    needsClarification,
    clarificationMessage,
    executionPlan,
    isDestructive
  };
}
