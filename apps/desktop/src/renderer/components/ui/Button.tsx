import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent-primary text-white hover:bg-accent-hover active:bg-accent-hover disabled:bg-surface-active disabled:text-text-disabled',
  secondary:
    'bg-surface-overlay text-text-primary border border-surface-border hover:bg-surface-hover active:bg-surface-active disabled:text-text-disabled',
  ghost:
    'text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface-active disabled:text-text-disabled',
  danger:
    'bg-status-danger-muted text-status-danger border border-status-danger/20 hover:bg-status-danger/20 active:bg-status-danger/25 disabled:text-text-disabled',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-6 px-2 text-xs rounded-md gap-1.5',
  md: 'h-8 px-3 text-sm rounded-md gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex cursor-pointer items-center justify-center font-medium transition-colors duration-150 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : null}
      {children}
    </button>
  );
}
