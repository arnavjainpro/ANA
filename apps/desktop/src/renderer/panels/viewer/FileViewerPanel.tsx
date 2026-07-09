import Editor from '@monaco-editor/react';
import { languageForPath } from '../../lib/monaco';
import { useRepoStore } from '../../store/repoStore';
import { useUiStore } from '../../store/uiStore';

const EDITOR_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  scrollBeyondLastLine: false,
  automaticLayout: true,
} as const;

/**
 * Full-panel code viewer overlaid on the workspace when the user clicks a file
 * in the left sidebar (Understand / Plan modes). Fetches content from GitHub
 * and renders it read-only in Monaco. Hidden in Build mode (files open in the
 * Build editor instead).
 */
export function FileViewerPanel(): JSX.Element | null {
  const viewingFile = useRepoStore((s) => s.viewingFile);
  const viewingFileLoading = useRepoStore((s) => s.viewingFileLoading);
  const closeRepoFile = useRepoStore((s) => s.closeRepoFile);
  const buildMode = useUiStore((s) => s.activeMode === 'Build');

  if (buildMode || (!viewingFile && !viewingFileLoading)) return null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-ana-bg">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-ana-border bg-ana-panel px-4 py-2">
        <span className="truncate font-mono text-xs text-ana-text">
          {viewingFile?.path ?? '…'}
        </span>
        <button
          type="button"
          onClick={closeRepoFile}
          aria-label="Close file viewer"
          className="ml-4 flex-shrink-0 rounded p-1 text-ana-text-muted transition-colors hover:text-ana-text"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {viewingFileLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-ana-text-muted">Loading…</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <Editor
            height="100%"
            theme="vs-dark"
            path={viewingFile!.path}
            language={languageForPath(viewingFile!.path)}
            value={viewingFile!.content}
            options={EDITOR_OPTIONS}
          />
        </div>
      )}
    </div>
  );
}
