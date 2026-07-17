import type { ReactNode } from 'react';

/** Rounded card grouping related SettingsRows, Cursor-settings style. */
export function SettingsCard({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg border border-surface-border bg-surface-raised">
      {children}
    </div>
  );
}

interface SettingsRowProps {
  title: string;
  description?: string;
  control: ReactNode;
}

/** A single labeled row inside a SettingsCard: title/description left, control right. */
export function SettingsRow({ title, description, control }: SettingsRowProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-surface-border px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-text-primary">{title}</span>
        {description ? <span className="text-xs text-text-secondary">{description}</span> : null}
      </div>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );
}

/** Small uppercase group label above a SettingsCard (e.g. "Notifications"). */
export function SettingsGroupLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
      {children}
    </h3>
  );
}
