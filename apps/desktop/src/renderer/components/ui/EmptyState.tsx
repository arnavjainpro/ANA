import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center animate-fade-in-up">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-surface-border bg-surface-overlay text-text-tertiary">
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium text-text-primary">{title}</p>
        {description ? (
          <p className="max-w-xs text-sm text-text-secondary">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
