import { useEffect, useState } from 'react';
import { useRepoStore } from '../store/repoStore';
import { useUiStore } from '../store/uiStore';

/**
 * Side pane IDE for viewing/editing files.
 * Displays file tabs and syntax-highlighted content.
 */
export function FileViewer(): JSX.Element {
  const { openFiles, activeFileIndex, closeFile, setActiveFile } = useUiStore();
  const { selectedRepo } = useRepoStore();
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeFile = activeFileIndex !== null ? openFiles[activeFileIndex] : null;

  // Load file content when active file changes
  useEffect(() => {
    if (!activeFile || !selectedRepo || fileContents[activeFile.path]) return;

    setLoading(true);
    setError(null);

    window.ana.repo
      .file(selectedRepo.full_name, activeFile.path)
      .then((result) => {
        if ('error' in result) {
          setError(result.error);
          setFileContents((prev) => ({
            ...prev,
            [activeFile.path]: `// Error: ${result.error}`,
          }));
        } else {
          setFileContents((prev) => ({
            ...prev,
            [activeFile.path]: result.content,
          }));
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to load file';
        setError(msg);
        setFileContents((prev) => ({
          ...prev,
          [activeFile.path]: `// Error: ${msg}`,
        }));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [activeFile, selectedRepo, fileContents]);

  if (openFiles.length === 0) {
    return <></>;
  }

  const activeContent = activeFile ? fileContents[activeFile.path] : '';

  // Simple syntax highlighting based on file extension
  const getLanguage = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      rs: 'rust',
      go: 'go',
      rb: 'ruby',
      php: 'php',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      html: 'html',
      css: 'css',
      sql: 'sql',
      sh: 'shell',
      bash: 'shell',
    };
    return langMap[ext] || 'plaintext';
  };

  return (
    <div className="flex h-full flex-col bg-ana-panel border-l border-ana-border overflow-hidden">
      {/* File Tabs */}
      <div className="flex items-center gap-1 border-b border-ana-border bg-ana-panel px-2 py-2 overflow-x-auto">
        {openFiles.map((file, idx) => (
          <button
            key={file.path}
            onClick={() => setActiveFile(idx)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-t text-sm whitespace-nowrap transition-colors ${
              idx === activeFileIndex
                ? 'bg-ana-bg text-ana-text border-b-2 border-ana-accent'
                : 'text-ana-text-muted hover:text-ana-text hover:bg-ana-hover'
            }`}
          >
            <span className="font-mono text-xs">{file.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeFile(file.path);
              }}
              className="ml-1 p-0.5 hover:bg-ana-border rounded transition-colors"
              title="Close file"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          </button>
        ))}
      </div>

      {/* File Content */}
      <div className="flex-1 overflow-auto bg-ana-bg">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-ana-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-ana-text-muted">Loading…</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-sm text-ana-text-muted mb-2">Failed to load file</p>
              <p className="text-xs text-ana-text-muted">{error}</p>
            </div>
          </div>
        ) : activeFile ? (
          <div className="h-full flex flex-col">
            {/* File path info */}
            <div className="px-4 py-2 border-b border-ana-border bg-ana-panel text-xs text-ana-text-muted">
              {activeFile.path} <span className="text-ana-accent ml-2">({getLanguage(activeFile.path)})</span>
            </div>
            {/* Line numbers + content */}
            <pre className="flex-1 p-4 text-xs font-mono text-ana-text whitespace-pre-wrap break-words overflow-auto">
              <code>
                {activeContent.split('\n').map((line, i) => (
                  <div key={i} className="flex">
                    <span className="w-12 text-right pr-4 text-ana-text-muted select-none">{i + 1}</span>
                    <span>{line}</span>
                  </div>
                ))}
              </code>
            </pre>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-ana-text-muted">No file selected</p>
          </div>
        )}
      </div>
    </div>
  );
}
