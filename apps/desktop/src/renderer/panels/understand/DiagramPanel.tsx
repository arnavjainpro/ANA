import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { useConversationStore } from '../../store/conversationStore';
import { FadeIn } from '../../components/FadeIn';

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
          // Expose the rendered diagram to assistive tech as a single image.
          const rendered = el.querySelector('svg');
          if (rendered) {
            rendered.setAttribute('role', 'img');
            rendered.setAttribute('aria-label', 'Architecture diagram');
          }
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
    <FadeIn className="flex h-full flex-col bg-ana-bg">
      <div className="border-b border-ana-border px-6 py-4 bg-ana-panel">
        <h2 tabIndex={-1} className="text-lg font-semibold text-ana-text">Architecture</h2>
        <p className="mt-1 text-xs text-ana-text-muted">System structure and data flow</p>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        {!diagram ? (
          <div className="text-center">
            <svg aria-hidden="true" className="w-12 h-12 mx-auto text-ana-text-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="text-sm text-ana-text-muted">
              Ask Ana about the repo to see a diagram
            </p>
          </div>
        ) : error ? (
          <div className="text-center">
            <p className="text-sm text-red-400 mb-2">Failed to render diagram</p>
            <p className="text-xs text-ana-text-muted">{error}</p>
          </div>
        ) : (
          <div ref={containerRef} className="max-h-full max-w-full svg-container" />
        )}
      </div>
    </FadeIn>
  );
}
