import { useEffect, useRef, useState } from 'react';
import { DiagramPanel } from '../panels/understand/DiagramPanel';
import { WhiteboardPanel } from '../panels/plan/WhiteboardPanel';
import { BuildPanel } from '../panels/build/BuildPanel';
import { PanelSkeleton } from './PanelSkeleton';
import { useUiStore } from '../store/uiStore';
import { useConversationStore } from '../store/conversationStore';

/** Whether the user has asked the OS to minimise non-essential motion. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Renders the active right-panel content and cross-fades it when the mode
 * changes (opacity 1 → 0 → 1, 150ms each leg). After the fade-in settles,
 * focus moves to the panel heading so keyboard / screen-reader users land on
 * the new content. While a Claude turn is in flight a skeleton is shown.
 *
 * Under `prefers-reduced-motion` the cross-fade is skipped entirely (the
 * `transitionend` event never fires when transitions are disabled), so the
 * content swaps instantly and focus still moves — functionality is preserved.
 */
export function WorkspaceContent(): JSX.Element {
  const activeMode = useUiStore((s) => s.activeMode);
  const isPanelLoading = useUiStore((s) => s.isPanelLoading);
  const diagram = useConversationStore((s) => s.diagram);

  // The mode currently painted — lags `activeMode` until the fade-out finishes.
  const [displayMode, setDisplayMode] = useState(activeMode);
  const [visible, setVisible] = useState(true);
  // Set when a fade-in completes and focus should jump to the heading.
  const focusOnSettle = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const focusHeading = (): void => {
    containerRef.current?.querySelector<HTMLElement>('h2')?.focus();
  };

  useEffect(() => {
    if (activeMode === displayMode) return;
    if (prefersReducedMotion()) {
      // No animation: swap immediately and move focus on the next frame.
      setDisplayMode(activeMode);
      const id = requestAnimationFrame(focusHeading);
      return () => cancelAnimationFrame(id);
    }
    setVisible(false); // begin fade-out; swap happens on transition end
    return undefined;
  }, [activeMode, displayMode]);

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget || e.propertyName !== 'opacity') return;
    if (!visible) {
      // Fade-out done: swap content in and fade back up, then focus.
      setDisplayMode(activeMode);
      focusOnSettle.current = true;
      setVisible(true);
    } else if (focusOnSettle.current) {
      focusOnSettle.current = false;
      focusHeading();
    }
  };

  return (
    <div
      ref={containerRef}
      onTransitionEnd={handleTransitionEnd}
      className={`h-full transition-opacity duration-150 ease-in-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {isPanelLoading && displayMode !== 'Build' && displayMode !== 'Understand' ? (
        <PanelSkeleton />
      ) : displayMode === 'Build' ? (
        <BuildPanel />
      ) : displayMode === 'Plan' ? (
        <WhiteboardPanel />
      ) : (
        // Understand: DiagramPanel renders its own loading skeleton.
        <DiagramPanel
          mermaid={diagram?.mermaid ?? ''}
          isLoading={isPanelLoading}
          highlightedNodes={diagram?.highlightedNodes}
        />
      )}
    </div>
  );
}
