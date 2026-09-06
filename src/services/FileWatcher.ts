import { syncWorkspaceToMonaco } from './monacoWorkspaceSync';
import { fileService } from './fileService';
import { FileNode } from '../types/file.types';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useEditorStore } from '../store/editorStore';
import { useUIStore } from '../store/uiStore';

class FileWatcher {
    private interval: any;
    private currentTree: Map<string, number> = new Map();
    private activePath: string | null = null;
    
    start() {
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.poll(), 3000);
        window.addEventListener('ai-web-ide:file-saved', () => this.forcePoll());
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    private forcePoll() {
        setTimeout(() => this.poll(), 500); // Give file system a moment
    }

    private flattenTree(nodes: FileNode[], map: Map<string, number>) {
        for (const node of nodes) {
            if (node.type === 'file') {
                map.set(node.path, node.lastModified || 0);
            }
            if (node.children) {
                this.flattenTree(node.children, map);
            }
        }
    }

    private async poll() {
        const workspace = useWorkspaceStore.getState().workspace;
        if (!workspace) {
            this.activePath = null;
            this.currentTree.clear();
            return;
        }
        
        // If workspace changed, reset baseline immediately without firing events
        if (this.activePath !== workspace.path) {
            this.activePath = workspace.path;
            syncWorkspaceToMonaco(workspace.path);
            try {
                const nodes = await fileService.getFileTree(workspace.path);
                this.currentTree.clear();
                this.flattenTree(nodes, this.currentTree);
            } catch (e) {}
            return;
        }

        try {
            const nodes = await fileService.getFileTree(workspace.path);
            const newTree = new Map<string, number>();
            this.flattenTree(nodes, newTree);
            
            let changed = false;
            let externalChangeDetected = false;

            // Check for additions and modifications
            for (const [path, modified] of Array.from(newTree.entries())) {
                if (!this.currentTree.has(path)) {
                    changed = true;
                    window.dispatchEvent(new CustomEvent('ai-web-ide:file-created', { detail: { path } }));
                } else {
                    const oldMod = this.currentTree.get(path)!;
                    // If file changed externally, we need to handle it safely
                    if (modified !== oldMod && oldMod !== 0 && modified !== 0) {
                         const timeDiff = modified - oldMod;
                         // Check if this was an external change (if we didn't save it ourselves recently)
                         // For now, we will fire the event, and Editor.tsx will handle the dirty logic
                         window.dispatchEvent(new CustomEvent('ai-web-ide:file-changed', { detail: { path, external: true } }));
                    }
                }
            }

            // Check for deletions
            for (const path of Array.from(this.currentTree.keys())) {
                if (!newTree.has(path)) {
                    changed = true;
                    window.dispatchEvent(new CustomEvent('ai-web-ide:file-deleted', { detail: { path } }));
                }
            }

            this.currentTree = newTree;

            if (changed) {
                window.dispatchEvent(new CustomEvent('ai-web-ide:workspace-changed'));
            }

        } catch (e) {
            // Probably permission lost
        }
    }
}

export const fileWatcher = new FileWatcher();
fileWatcher.start();
