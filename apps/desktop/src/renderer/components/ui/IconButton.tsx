import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — icon-only buttons are invisible to screen readers without it. */
  'aria-label': string;
  active?: boolean;
  children: ReactNode;
}

export function IconButton({ active = false, children, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 disabled:cursor-not-allowed disabled:text-text-disabled ${
        active
          ? 'bg-accent-muted text-accent-primary'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface-active'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
