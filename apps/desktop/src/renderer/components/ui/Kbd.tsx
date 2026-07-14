import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-surface-border bg-surface-overlay px-1 font-mono text-xs text-text-tertiary">
      {children}
    </kbd>
  );
}
