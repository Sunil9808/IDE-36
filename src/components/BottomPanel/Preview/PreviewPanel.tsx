import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Monitor, Play, RefreshCw, Smartphone, Square, Tablet, ZoomIn, ZoomOut } from 'lucide-react';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { projectService, ProjectDetection, ProjectProcess } from '../../../services/projectService';

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

const DEVICE_WIDTH: Record<DeviceMode, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

export default function PreviewPanel() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const [detection, setDetection] = useState<ProjectDetection | null>(null);
  const [processInfo, setProcessInfo] = useState<ProjectProcess | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [zoom, setZoom] = useState(1);
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [refreshKey, setRefreshKey] = useState(0);
  const [status, setStatus] = useState('No preview running');

  const sourceUrl = useMemo(() => {
    if (manualUrl.trim()) return manualUrl.trim();
    if (previewUrl) return previewUrl;
    if (detection?.preview?.kind === 'html' && detection.preview.filePath) {
      return projectService.htmlPreviewUrl(detection.preview.filePath);
    }
    return detection?.preview?.url || '';
  }, [detection, manualUrl, previewUrl]);

  useEffect(() => {
    async function detect() {
      try {
        const result = await projectService.detect(workspace?.path);
        setDetection(result);
        if (result.preview?.url) setPreviewUrl(result.preview.url);
        setStatus(`Detected ${result.framework}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Project detection failed');
      }
    }

    void detect();
  }, [workspace?.path]);

  useEffect(() => {
    const onSaved = () => setRefreshKey((value) => value + 1);
    window.addEventListener('ai-web-ide:file-saved', onSaved);
    window.addEventListener('ai-web-ide:workspace-changed', onSaved);
    return () => {
      window.removeEventListener('ai-web-ide:file-saved', onSaved);
      window.removeEventListener('ai-web-ide:workspace-changed', onSaved);
    };
  }, []);

  const startProject = async () => {
    setStatus('Starting project...');
    try {
      const result = await projectService.start(workspace?.path);
      setProcessInfo(result);
      setDetection(result.detection);
      if (result.url) setPreviewUrl(result.url);
      setStatus(`Started ${result.command}`);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to start project');
    }
  };

  const stopProject = async () => {
    if (!processInfo?.id) return;
    await projectService.stop(processInfo.id);
    setProcessInfo({ ...processInfo, status: 'exited' });
    setStatus('Project stopped');
  };

  const iframeSrc = sourceUrl ? `${sourceUrl}${sourceUrl.includes('?') ? '&' : '?'}previewReload=${refreshKey}` : '';

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: '#111827' }}>
      <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <button className="toolbar-btn" onClick={() => void startProject()} title="Start Project"><Play size={14} /></button>
        <button className="toolbar-btn" onClick={() => void stopProject()} title="Stop Project" disabled={!processInfo || processInfo.status === 'exited'}><Square size={14} /></button>
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
          value={manualUrl || previewUrl}
          onChange={(event) => setManualUrl(event.target.value)}
        />
        <span className="max-w-[220px] truncate text-[11px]" style={{ color: '#94a3b8' }}>{status}</span>
      </div>

      <div className="flex min-h-0 flex-1 justify-center overflow-auto p-3">
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
            Start a detected project or enter a preview URL.
          </div>
        )}
      </div>
    </div>
  );
}
