import { useEffect, useState } from 'react';
import { useUiStore } from '../store/uiStore';

/**
 * Side pane IDE for viewing/editing files.
 * Displays file tabs and syntax-highlighted content.
 */
export function FileViewer(): JSX.Element {
  const { openFiles, activeFileIndex, closeFile, setActiveFile } = useUiStore();
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const activeFile = activeFileIndex !== null ? openFiles[activeFileIndex] : null;

  // Load file content when active file changes
  useEffect(() => {
    if (!activeFile || fileContents[activeFile.path]) return;

    setLoading(true);
    // TODO: Fetch file content from backend
    // For now, show a placeholder
    setFileContents((prev) => ({
      ...prev,
      [activeFile.path]: `// File: ${activeFile.path}\n// Content would be loaded from the repo\n\n(File viewer coming soon)`,
    }));
    setLoading(false);
  }, [activeFile, fileContents]);

  if (openFiles.length === 0) {
    return <></>;
  }

  const activeContent = activeFile ? fileContents[activeFile.path] : '';

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
              aria-label={`Close ${file.name}`}
              title="Close file"
            >
              <svg aria-hidden="true" className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
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
            <p className="text-sm text-ana-text-muted">Loading…</p>
          </div>
        ) : activeFile ? (
          <pre className="p-4 text-xs font-mono text-ana-text whitespace-pre-wrap break-words">
            <code>{activeContent}</code>
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-ana-text-muted">No file selected</p>
          </div>
        )}
      </div>
    </div>
  );
}
