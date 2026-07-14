import type { ReactNode } from 'react';

interface PanelHeaderProps {
  title: string;
  /** Optional secondary line under or next to the title. */
  subtitle?: string;
  icon?: ReactNode;
  /** Right-aligned actions (IconButtons, chips). */
  actions?: ReactNode;
  /** Forwarded so panels can keep their focus-on-settle behavior. */
  titleId?: string;
}

export function PanelHeader({ title, subtitle, icon, actions, titleId }: PanelHeaderProps) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-surface-border bg-surface-raised px-4">
      <div className="flex min-w-0 items-center gap-2">
        {icon ? <span className="text-text-tertiary">{icon}</span> : null}
        <h2
          id={titleId}
          tabIndex={-1}
          className="truncate text-xs font-semibold uppercase tracking-wide text-text-secondary outline-none"
        >
          {title}
        </h2>
        {subtitle ? (
          <span className="truncate text-xs text-text-tertiary">{subtitle}</span>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}
