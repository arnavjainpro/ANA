import { useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor, Range as MonacoRange } from 'monaco-editor';
import { languageForPath } from '../../lib/monaco';
import { useBuildStore } from '../../store/buildStore';

type MonacoApi = typeof import('monaco-editor');

/** Line numbers (1-based) in `updated` that differ from `original`. */
function changedLines(original: string, updated: string): number[] {
  const before = original.split('\n');
  const after = updated.split('\n');
  const lines: number[] = [];
  for (let i = 0; i < after.length; i += 1) {
    if (after[i] !== before[i]) lines.push(i + 1);
  }
  return lines;
}

/**
 * Read-only Monaco editor — Ana's workspace. The user never edits here; all
 * changes arrive as patches. When a patch updates the open file, changed lines
 * are highlighted for 3 seconds, then the decorations clear.
 */
export function CodeEditor(): JSX.Element {
  const openPath = useBuildStore((s) => s.openPath);
  const openContents = useBuildStore((s) => s.openContents);
  const decoration = useBuildStore((s) => s.decoration);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<MonacoApi | null>(null);
  const decoIds = useRef<string[]>([]);

  const handleMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco as MonacoApi;
  };

  const nonce = decoration?.nonce ?? 0;
  useEffect(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco || !decoration) return;

    const ranges: editor.IModelDeltaDecoration[] = changedLines(
      decoration.original,
      decoration.updated,
    ).map((line) => ({
      range: new monaco.Range(line, 1, line, 1) as MonacoRange,
      options: { isWholeLine: true, className: 'ana-diff-added-line' },
    }));

    decoIds.current = ed.deltaDecorations(decoIds.current, ranges);
    const timer = window.setTimeout(() => {
      const current = editorRef.current;
      if (current) decoIds.current = current.deltaDecorations(decoIds.current, []);
    }, 3000);
    return () => window.clearTimeout(timer);
    // Re-run whenever a new patch lands on the open file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

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

  return (
    <div
      className="h-full bg-ana-bg"
      aria-label="Code editor — read only. Ana makes changes here."
    >
      <Editor
        height="100%"
        theme="vs-dark"
        path={openPath}
        language={languageForPath(openPath)}
        value={openContents}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
        onMount={handleMount}
      />
    </div>
  );
}
