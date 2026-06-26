import { useBuildStore } from '../../store/buildStore';
import { useConversationStore } from '../../store/conversationStore';

/**
 * Always-visible safety net at the bottom of the Build panel. Since Ana applies
 * changes to disk as she makes them, this is how the user reverses the last
 * operation. It shows what the last change was and offers a single Undo; when
 * there's nothing to undo it stays visible but quietly disabled.
 */
export function UndoBar(): JSX.Element {
  const canUndo = useBuildStore((s) => s.canUndo);
  const busy = useBuildStore((s) => s.busy);
  const lastSummary = useBuildStore((s) => s.lastSummary);
  const undo = useBuildStore((s) => s.undo);
  const pushAssistant = useConversationStore((s) => s.pushAssistant);

  const disabled = !canUndo || busy;

  async function handleUndo(): Promise<void> {
    const spoken = await undo();
    if (spoken) pushAssistant(spoken);
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t border-ana-border bg-ana-panel px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-2 w-2 flex-shrink-0 rounded-full ${
            canUndo ? 'bg-yellow-400' : 'bg-ana-border'
          }`}
        />
        <p aria-live="polite" className="truncate text-xs text-ana-text-muted">
          {canUndo && lastSummary ? (
            <>
              Last change: <span className="text-ana-text">{lastSummary}</span>
            </>
          ) : (
            'No changes to undo'
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void handleUndo()}
        disabled={disabled}
        aria-disabled={disabled}
        aria-label="Undo last change"
        className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
          disabled
            ? 'cursor-not-allowed border-ana-border text-ana-text-muted opacity-50'
            : 'border-ana-brand-border text-ana-brand hover:bg-ana-brand hover:text-white'
        }`}
      >
        <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v1M3 10l4-4M3 10l4 4" />
        </svg>
        Undo
      </button>
    </div>
  );
}
