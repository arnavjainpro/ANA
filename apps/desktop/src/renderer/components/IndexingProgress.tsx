import { useEffect, useState } from 'react';
import { useRepoStore } from '../store/repoStore';

/**
 * Slim, non-blocking progress bar pinned to the top of the workspace panel
 * while a repo is being indexed. The percentage drives the fill width (CSS
 * width transition) and the status string is mirrored into an `aria-live`
 * region so screen readers hear updates without interruption.
 *
 * On completion the whole strip fades out (400ms) and is then removed from the
 * DOM via the transition-end handler — no layout shift, no `setTimeout`.
 */
export function IndexingProgress(): JSX.Element | null {
  const indexStatus = useRepoStore((s) => s.indexStatus);
  const indexMessage = useRepoStore((s) => s.indexMessage);
  const processed = useRepoStore((s) => s.indexProcessed);
  const total = useRepoStore((s) => s.indexTotal);

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (indexStatus === 'indexing') {
      setMounted(true);
      // Flip visible on the next frame so the fade-in transition registers.
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    // Any non-indexing state fades the strip out; it unmounts on transition end.
    setVisible(false);
    // When transitions are disabled (reduced motion) `transitionend` never
    // fires, so unmount immediately rather than lingering in the DOM.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMounted(false);
    }
    return undefined;
  }, [indexStatus]);

  if (!mounted) return null;

  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  return (
    <div
      className={`pointer-events-none absolute left-0 right-0 top-0 z-10 transition-opacity duration-[400ms] ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden={!visible}
      onTransitionEnd={(e) => {
        if (e.propertyName === 'opacity' && !visible) setMounted(false);
      }}
    >
      <div className="h-1 w-full overflow-hidden bg-ana-border">
        <div
          className="ana-progress-fill h-full bg-ana-brand"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="bg-ana-panel px-6 py-1 text-xs text-ana-text-muted" aria-live="polite">
        {indexMessage}
      </p>
    </div>
  );
}
