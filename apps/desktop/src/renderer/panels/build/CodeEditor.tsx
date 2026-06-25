import Editor, { DiffEditor } from '@monaco-editor/react';
import { languageForPath } from '../../lib/monaco';
import { useBuildStore } from '../../store/buildStore';

const EDITOR_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  scrollBeyondLastLine: false,
  automaticLayout: true,
} as const;

/**
 * Ana's workspace view. The user never edits here. When the open file was
 * changed by Ana's last turn, it renders a side-by-side before/after diff
 * (original vs updated). Otherwise it shows the file read-only. The diff stays
 * up until the next turn replaces it, an undo clears it, or the user opens a
 * file that wasn't changed.
 */
export function CodeEditor(): JSX.Element {
  const openPath = useBuildStore((s) => s.openPath);
  const openContents = useBuildStore((s) => s.openContents);
  const lastPatches = useBuildStore((s) => s.lastPatches);

  if (!openPath) {
    return (
      <div
        className="flex h-full items-center justify-center bg-ana-bg p-6 text-center"
        aria-label="Code editor — read only. Ana makes changes here."
      >
        <p className="text-sm text-ana-text-muted">
          Pick a file from the tree, or ask Ana to make a change.
        </p>
      </div>
    );
  }

  const patch = lastPatches.find((p) => p.path === openPath);

  if (patch) {
    return (
      <div className="h-full bg-ana-bg" aria-label={`Diff for ${openPath} — original versus Ana's change.`}>
        <DiffEditor
          height="100%"
          theme="vs-dark"
          language={languageForPath(openPath)}
          original={patch.original}
          modified={patch.updated}
          options={{ ...EDITOR_OPTIONS, renderSideBySide: true }}
        />
      </div>
    );
  }

  return (
    <div className="h-full bg-ana-bg" aria-label="Code editor — read only. Ana makes changes here.">
      <Editor
        height="100%"
        theme="vs-dark"
        path={openPath}
        language={languageForPath(openPath)}
        value={openContents}
        options={EDITOR_OPTIONS}
      />
    </div>
  );
}
