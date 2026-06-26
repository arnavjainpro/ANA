import { FadeIn } from './FadeIn';

/**
 * Placeholder shown in the right panel while a Claude reasoning turn is in
 * flight. Sized to roughly match the diagram / whiteboard content that will
 * replace it so there is no layout shift when the real payload arrives.
 */
export function PanelSkeleton(): JSX.Element {
  return (
    <FadeIn className="flex h-full flex-col bg-ana-bg">
      {/* Header band, matching the panel headers' height. */}
      <div className="border-b border-ana-border bg-ana-panel px-6 py-3">
        <div className="h-3.5 w-40 rounded bg-ana-hover ana-pulse" aria-hidden="true" />
        <div className="mt-2 h-3 w-56 rounded bg-ana-hover ana-pulse" aria-hidden="true" />
      </div>

      {/* Body blocks. */}
      <div className="flex-1 space-y-4 overflow-hidden p-6">
        <div className="h-32 w-full rounded-lg bg-ana-hover ana-pulse" aria-hidden="true" />
        <div className="h-4 w-3/4 rounded bg-ana-hover ana-pulse" aria-hidden="true" />
        <div className="h-4 w-2/3 rounded bg-ana-hover ana-pulse" aria-hidden="true" />
        <div className="h-4 w-1/2 rounded bg-ana-hover ana-pulse" aria-hidden="true" />
      </div>

      <span className="sr-only">Ana is thinking…</span>
    </FadeIn>
  );
}
