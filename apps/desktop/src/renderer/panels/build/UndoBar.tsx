import { useBuildStore } from '../../store/buildStore';
import { useConversationStore } from '../../store/conversationStore';

/** Slim always-visible bar at the bottom of the Build panel with the last
 *  operation summary and a single Undo button. */
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
      <p aria-live="polite" className="truncate text-xs text-ana-text-muted">
        {lastSummary ? `Last change: ${lastSummary}` : 'No changes to undo'}
      </p>
      <button
        type="button"
        onClick={() => void handleUndo()}
        disabled={disabled}
        aria-disabled={disabled}
        aria-label="Undo last change"
        className="rounded border border-ana-border px-3 py-1 text-xs font-medium text-ana-text transition-colors hover:bg-ana-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        Undo
      </button>
    </div>
  );
}
