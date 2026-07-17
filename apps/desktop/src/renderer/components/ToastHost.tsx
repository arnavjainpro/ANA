import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';
import { useToastStore, type ToastVariant } from '../store/toastStore';
import { IconButton } from './ui';

const ICONS: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  info: Info,
  error: AlertCircle,
};

const ICON_COLOR: Record<ToastVariant, string> = {
  success: 'text-status-success',
  info: 'text-accent-primary',
  error: 'text-status-danger',
};

/**
 * Bottom-right stack of transient, non-voice confirmations (change applied,
 * project created, repo indexed). Auto-dismiss is handled by the store; each
 * toast can also be dismissed manually. Sits above the terminal but below
 * modals (z-40). `role="status"` so screen readers announce it politely.
 */
export function ToastHost(): JSX.Element {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return <></>;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-80 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.variant];
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex animate-fade-in-up items-start gap-2.5 rounded-lg border border-surface-border bg-surface-modal px-3 py-2.5 shadow-overlay"
          >
            <Icon
              size={16}
              strokeWidth={1.75}
              aria-hidden
              className={`mt-0.5 flex-shrink-0 ${ICON_COLOR[toast.variant]}`}
            />
            <p className="min-w-0 flex-1 text-sm text-text-primary">{toast.message}</p>
            <IconButton
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
              className="-mr-1 -mt-0.5 h-6 w-6 flex-shrink-0"
            >
              <X size={14} strokeWidth={1.75} aria-hidden />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
