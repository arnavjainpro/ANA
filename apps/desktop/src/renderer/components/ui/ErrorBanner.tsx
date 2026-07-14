import { forwardRef } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export const ErrorBanner = forwardRef<HTMLDivElement, ErrorBannerProps>(function ErrorBanner(
  { message, onDismiss, className = '' },
  ref,
) {
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={`flex items-center gap-2 border border-status-danger/20 bg-status-danger-muted px-3 py-2 text-sm text-status-danger outline-none ${className}`}
    >
      <AlertCircle size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{message}</span>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss error"
          onClick={onDismiss}
          className="shrink-0 cursor-pointer rounded p-0.5 transition-colors duration-150 hover:bg-status-danger/20"
        >
          <X size={12} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </div>
  );
});
