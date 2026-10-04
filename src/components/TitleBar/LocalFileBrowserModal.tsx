import React, { useState, useEffect } from 'react';
import { X, Folder, ChevronLeft, HardDrive } from 'lucide-react';

interface LocalFileBrowserModalProps {
  onClose: () => void;
  onSelect: (path: string) => void;
}

interface DirInfo {
  name: string;
  path: string;
}

interface DirState {
  currentPath: string;
  parentPath: string | null;
  directories: DirInfo[];
}

export const LocalFileBrowserModal: React.FC<LocalFileBrowserModalProps> = ({ onClose, onSelect }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DirState | null>(null);
  const [inputPath, setInputPath] = useState('');

  const fetchDir = async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = path ? `/api/workspace/list-dir?path=${encodeURIComponent(path)}` : '/api/workspace/list-dir';
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch directory');
      setData(json);
      setInputPath(json.currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDir();
  }, []);

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDir(inputPath);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1e1e1e] border border-[#333] rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <h2 className="text-lg font-medium text-gray-200">Open Folder</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 border-b border-[#333] bg-[#252525]">
          <form onSubmit={handleInputSubmit} className="flex gap-2">
            <input 
              type="text" 
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              className="flex-1 bg-[#1e1e1e] border border-[#444] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              placeholder="e.g. C:\Projects"
            />
            <button type="submit" className="px-4 py-1.5 bg-[#333] hover:bg-[#444] text-gray-200 text-sm rounded transition-colors">
              Go
            </button>
          </form>
          {error && <div className="mt-2 text-red-400 text-xs">{error}</div>}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">Loading...</div>
          ) : (
            <div className="space-y-1">
              {data?.parentPath && (
                <button
                  onClick={() => fetchDir(data.parentPath!)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-gray-300 hover:bg-[#2a2a2a] rounded group"
                >
                  <ChevronLeft size={18} className="text-gray-500 group-hover:text-gray-300" />
                  <span>..</span>
                </button>
              )}
              {data?.directories.map((dir) => (
                <button
                  key={dir.path}
                  onClick={() => fetchDir(dir.path)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-gray-300 hover:bg-[#2a2a2a] rounded group"
                >
                  <Folder size={18} className="text-blue-400 opacity-80 group-hover:opacity-100" />
                  <span className="truncate">{dir.name}</span>
                </button>
              ))}
              {data?.directories.length === 0 && (
                <div className="p-8 text-center text-gray-500 text-sm">
                  This folder contains no sub-directories.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#333] bg-[#252525] flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => data?.currentPath && onSelect(data.currentPath)}
            disabled={!data?.currentPath}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
          >
            Select This Folder
          </button>
        </div>
      </div>
    </div>
  );
};
