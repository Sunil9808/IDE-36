import React, { useEffect, useRef } from 'react';
import { useOutputStore } from '../../../store/outputStore';
import { Trash2 } from 'lucide-react';

export default function OutputPanel() {
  const { logs, clearLogs } = useOutputStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView();
    }
  }, [logs]);

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error': return '#f14c4c';
      case 'warn': return '#cca700';
      case 'info':
      default:
        return '#cccccc';
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'Backend': return '#4ec9b0';
      case 'Frontend': return '#569cd6';
      case 'AI': return '#c586c0';
      default: return '#858585';
    }
  };

  const formatTime = (ts: string) => {
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) return ts;
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      const s = String(date.getSeconds()).padStart(2, '0');
      const ms = String(date.getMilliseconds()).padStart(3, '0');
      return `${h}:${m}:${s}.${ms}`;
    } catch {
      return ts;
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#1e1e1e' }}>
      <div className="flex justify-between items-center px-3 py-1 border-b" style={{ borderColor: '#2d2d2d', background: '#252526' }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#cccccc' }}>Output</span>
        <button 
          onClick={clearLogs}
          className="p-1 rounded transition-colors"
          style={{ color: '#cccccc', cursor: 'pointer' }}
          title="Clear Output"
        >
          <Trash2 size={14} />
        </button>
      </div>
      
      <div className="flex-1 p-3 font-mono text-xs overflow-y-auto" style={{ color: '#cccccc' }}>
        {logs.length === 0 ? (
          <div style={{ color: '#858585', fontStyle: 'italic' }}>No output</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="mb-1" style={{ display: 'flex' }}>
              <span style={{ color: '#858585', marginRight: '8px', flexShrink: 0 }}>[{formatTime(log.timestamp)}]</span>
              <span style={{ color: getSourceColor(log.source), marginRight: '8px', flexShrink: 0 }}>[{log.source}]</span>
              <span style={{ color: getLogColor(log.level), whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
