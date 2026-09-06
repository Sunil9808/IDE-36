import * as monaco from 'monaco-editor';
import { fileService } from './fileService';
import { FileNode } from '../types/file.types';

const loadedModels = new Set<string>();

export async function syncWorkspaceToMonaco(workspacePath: string) {
    try {
        const tree = await fileService.getFileTree(workspacePath);
        const files: FileNode[] = [];
        
        const flatten = (nodes: FileNode[]) => {
            for (const n of nodes) {
                if (n.type === 'file') files.push(n);
                if (n.children && !['node_modules', '.git', 'dist', 'build'].includes(n.name)) {
                    flatten(n.children);
                }
            }
        };
        flatten(tree);

        // Load important files for language intelligence
        for (const file of files) {
            if (loadedModels.has(file.path)) continue;
            
            const ext = file.name.split('.').pop()?.toLowerCase();
            const supported = ['ts', 'tsx', 'js', 'jsx', 'json', 'css', 'html', 'md'];
            if (!supported.includes(ext || '')) continue;

            loadedModels.add(file.path);
            
            fileService.readFile(file.path).then(data => {
                const uriString = file.path.startsWith('file://') ? file.path : `file://${file.path}`;
                const uri = monaco.Uri.parse(uriString);
                if (!monaco.editor.getModel(uri)) {
                    monaco.editor.createModel(data.content, data.language || 'plaintext', uri);
                }
            }).catch(() => {});
        }
    } catch (e) {
        console.warn("Failed to sync workspace to Monaco:", e);
    }
}
