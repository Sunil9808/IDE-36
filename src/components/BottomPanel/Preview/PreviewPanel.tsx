import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Monitor, Play, RefreshCw, Smartphone, Square, Tablet, ZoomIn, ZoomOut } from 'lucide-react';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { localServerManager, LocalServer } from '../../../services/LocalServerManager';
import { executionService } from '../../../services/executionService';
import { useUIStore } from '../../../store/uiStore';

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

const DEVICE_WIDTH: Record<DeviceMode, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

export default function PreviewPanel() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const [servers, setServers] = useState<LocalServer[]>([]);
  const [manualUrl, setManualUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [zoom, setZoom] = useState(1);
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [refreshKey, setRefreshKey] = useState(0);

  const activeServer = servers.length > 0 ? servers[servers.length - 1] : null;

  const sourceUrl = useMemo(() => {
    if (manualUrl.trim()) return manualUrl.trim();
    if (previewUrl) return previewUrl;
    return activeServer?.url || '';
  }, [manualUrl, previewUrl, activeServer]);

  useEffect(() => {
    const unsubscribe = localServerManager.subscribe((newServers) => {
      setServers(newServers);
      if (newServers.length > 0 && !previewUrl) {
         setPreviewUrl(newServers[newServers.length - 1].url);
      }
    });
    setServers(localServerManager.getServers());
    return unsubscribe;
  }, []);

  useEffect(() => {
    const onRegistered = (e: CustomEvent) => {
        setPreviewUrl(e.detail.url);
        useUIStore.getState().setActiveBottomPanel('preview');
        useUIStore.getState().setBottomPanelVisible(true);
    };
    window.addEventListener('ai-web-ide:server-registered', onRegistered as any);
    return () => window.removeEventListener('ai-web-ide:server-registered', onRegistered as any);
  }, []);

  useEffect(() => {
    const onSaved = () => setRefreshKey((value) => value + 1);
    window.addEventListener('ai-web-ide:file-saved', onSaved);
    window.addEventListener('ai-web-ide:workspace-changed', onSaved);
    return () => {
      window.removeEventListener('ai-web-ide:file-saved', onSaved);
      window.removeEventListener('ai-web-ide:workspace-changed', onSaved);
    };
  }, []);

  const startProject = () => {
    if (workspace?.path) {
        useUIStore.getState().setActiveBottomPanel('terminal');
        executionService.runProject(workspace.path);
    }
  };

  const stopProject = () => {
     if (activeServer) {
        // Find if this path is running in executionService
        window.dispatchEvent(new CustomEvent('ai-web-ide:terminal-stop'));
     }
  };

  const iframeSrc = sourceUrl ? `${sourceUrl}${sourceUrl.includes('?') ? '&' : '?'}previewReload=${refreshKey}` : '';

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: '#111827' }}>
      <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <button className="toolbar-btn" onClick={() => void startProject()} title="Start Project"><Play size={14} /></button>
        <button className="toolbar-btn" onClick={() => void stopProject()} title="Stop Project" disabled={!activeServer}><Square size={14} /></button>
        <button className="toolbar-btn" onClick={() => setRefreshKey((value) => value + 1)} title="Refresh Preview"><RefreshCw size={14} /></button>
        <button className="toolbar-btn" onClick={() => sourceUrl && window.open(sourceUrl, '_blank', 'noopener,noreferrer')} title="Open in Browser"><ExternalLink size={14} /></button>

        <div className="mx-1 h-5 w-px" style={{ background: 'rgba(255,255,255,0.12)' }} />
        <button className="toolbar-btn" onClick={() => setDevice('desktop')} title="Desktop"><Monitor size={14} /></button>
        <button className="toolbar-btn" onClick={() => setDevice('tablet')} title="Tablet"><Tablet size={14} /></button>
        <button className="toolbar-btn" onClick={() => setDevice('mobile')} title="Mobile"><Smartphone size={14} /></button>
        <button className="toolbar-btn" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} title="Zoom Out"><ZoomOut size={14} /></button>
        <button className="toolbar-btn" onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))} title="Zoom In"><ZoomIn size={14} /></button>

        <input
          className="ml-2 h-7 min-w-0 flex-1 rounded px-2 text-xs outline-none"
          style={{ background: '#0b1220', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb' }}
          placeholder="Preview URL"
          value={manualUrl || previewUrl || activeServer?.url || ''}
          onChange={(event) => setManualUrl(event.target.value)}
        />
        <span className="max-w-[220px] truncate text-[11px]" style={{ color: '#94a3b8' }}>
            {activeServer ? `Detected Server on Port ${activeServer.port}` : 'No local server detected'}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 flex justify-center overflow-auto p-3 min-h-0">
          {iframeSrc ? (
            <div style={{ width: DEVICE_WIDTH[device], transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
              <iframe
                key={iframeSrc}
                src={iframeSrc}
                title="Live Preview"
                className="h-full min-h-[720px] w-full rounded border bg-white"
                style={{ borderColor: 'rgba(255,255,255,0.14)' }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-xs" style={{ color: '#94a3b8' }}>
              Start a project in the terminal to automatically detect and preview localhost URLs.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
