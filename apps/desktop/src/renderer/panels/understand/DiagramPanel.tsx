import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { useConversationStore } from '../../store/conversationStore';

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });

let renderSeq = 0;

/** Renders the Mermaid string from the latest Understand-mode response as SVG. */
export function DiagramPanel(): JSX.Element {
  const diagram = useConversationStore((s) => s.diagram);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = diagram?.mermaid;
    const el = containerRef.current;
    if (!el) return;
    if (!code) {
      el.innerHTML = '';
      return;
    }
    let cancelled = false;
    const id = `ana-diagram-${(renderSeq += 1)}`;
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (!cancelled) {
          el.innerHTML = svg;
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not render diagram.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [diagram]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ana-border px-4 py-2 text-sm font-medium text-gray-300">
        Architecture
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        {!diagram ? (
          <p className="text-sm text-gray-500">
            Ask Ana about the repo to see a diagram here.
          </p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <div ref={containerRef} className="max-h-full max-w-full" />
        )}
      </div>
    </div>
  );
}
