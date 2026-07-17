import { useEffect, useRef } from 'react';
import Editor, { DiffEditor, type Monaco } from '@monaco-editor/react';
import { defineAnaMonacoTheme } from '../../theme/tokens';
import { languageForPath } from '../../lib/monaco';
import { useBuildStore } from '../../store/buildStore';
import { useUiStore } from '../../store/uiStore';

const SHARED_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  scrollBeyondLastLine: false,
  automaticLayout: true,
} as const;

/**
 * Ana's workspace editor. When the open file was changed by Ana's last turn,
 * renders a side-by-side diff (original vs updated). Otherwise renders an
 * editable Monaco editor — the user can type, and Cmd/Ctrl+S saves to disk.
 * The diff view is always read-only.
 */
export function CodeEditor(): JSX.Element {
  const openPath = useBuildStore((s) => s.openPath);
  const openContents = useBuildStore((s) => s.openContents);
  const isDirty = useBuildStore((s) => s.isDirty);
  const lastPatches = useBuildStore((s) => s.lastPatches);
  const setOpenContents = useBuildStore((s) => s.setOpenContents);
  const saveFile = useBuildStore((s) => s.saveFile);
  const monacoTheme = useUiStore((s) => s.theme) === 'light' ? 'ana-light' : 'ana-dark';

  const saveRef = useRef(saveFile);
  saveRef.current = saveFile;

  // Cmd/Ctrl+S to save.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleEditorMount = (_editor: unknown, monaco: Monaco): void => {
    // Bind Cmd/Ctrl+S inside Monaco (the global handler covers outside clicks).
    monaco.editor.addCommand?.({
      id: 'save-file',
      run: () => void saveRef.current(),
    });
  };

  if (!openPath) {
    return (
      <div
        className="flex h-full items-center justify-center bg-surface-base p-6 text-center"
        aria-label="Code editor. Pick a file from the tree to view or edit it."
      >
        <p className="text-sm text-text-secondary">
          Pick a file from the tree to view or edit it.
        </p>
      </div>
    );
  }

  const patch = lastPatches.find((p) => p.path === openPath);

  if (patch) {
    return (
      <div className="flex h-full flex-col bg-surface-base" aria-label={`Diff for ${openPath}`}>
        <EditorToolbar path={openPath} isDirty={false} onSave={saveFile} isDiff />
        <div className="min-h-0 flex-1">
          <DiffEditor
            height="100%"
            theme={monacoTheme}
            beforeMount={defineAnaMonacoTheme}
            language={languageForPath(openPath)}
            original={patch.original}
            modified={patch.updated}
            options={{ ...SHARED_OPTIONS, readOnly: true, renderSideBySide: true }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-base" aria-label="Code editor">
      <EditorToolbar path={openPath} isDirty={isDirty} onSave={saveFile} />
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          theme={monacoTheme}
          beforeMount={defineAnaMonacoTheme}
          path={openPath}
          language={languageForPath(openPath)}
          value={openContents}
          options={SHARED_OPTIONS}
          onChange={(value) => setOpenContents(value ?? '')}
          onMount={handleEditorMount}
        />
      </div>
    </div>
  );
}

function EditorToolbar({
  path,
  isDirty,
  onSave,
  isDiff = false,
}: {
  path: string;
  isDirty: boolean;
  onSave: () => void;
  isDiff?: boolean;
}): JSX.Element {
  const fileName = path.split('/').pop() ?? path;
  return (
    <div className="flex flex-shrink-0 items-center justify-between border-b border-surface-border bg-surface-raised px-3 py-1.5">
      <div className="flex items-center gap-2 overflow-hidden">
        {isDirty && (
          <span
            aria-label="Unsaved changes"
            className="h-2 w-2 flex-shrink-0 rounded-full bg-status-warning"
          />
        )}
        <span className="truncate font-mono text-xs text-text-secondary" title={path}>
          {fileName}
        </span>
        {isDiff && (
          <span className="flex-shrink-0 rounded bg-surface-overlay px-1.5 py-0.5 text-[10px] text-text-secondary">
            diff
          </span>
        )}
      </div>
      {!isDiff && (
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty}
          title="Save file (⌘S)"
          className="ml-3 flex-shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-40 enabled:cursor-pointer enabled:bg-accent-primary enabled:text-white enabled:hover:bg-accent-hover"
        >
          Save
        </button>
      )}
    </div>
  );
}
