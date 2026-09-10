export interface LocalServer {
    id: string;
    workspaceId: string;
    projectRoot: string;
    command: string;
    port: number;
    host: string;
    url: string;
    pid?: number;
    status: "starting" | "running" | "stopped" | "failed";
}

class LocalServerManager {
    private servers: Map<string, LocalServer> = new Map();
    private listeners: Set<(servers: LocalServer[]) => void> = new Set();

    subscribe(listener: (servers: LocalServer[]) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private notify() {
        const list = Array.from(this.servers.values());
        this.listeners.forEach(l => l(list));
    }

    getServers() {
        return Array.from(this.servers.values());
    }

    getServer(id: string) {
        return this.servers.get(id);
    }

    registerServer(server: LocalServer) {
        this.servers.set(server.id, server);
        this.notify();
        // Fire global event for Preview Panel to pick up
        window.dispatchEvent(new CustomEvent('ai-web-ide:server-registered', { detail: server }));
    }

    updateServerStatus(id: string, status: LocalServer['status']) {
        const s = this.servers.get(id);
        if (s) {
            s.status = status;
            this.servers.set(id, s);
            this.notify();
        }
    }

    removeServer(id: string) {
        this.servers.delete(id);
        this.notify();
    }
}

export const localServerManager = new LocalServerManager();
