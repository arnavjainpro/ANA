import { Loader2 } from 'lucide-react';

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} strokeWidth={1.75} className="animate-spin" aria-hidden />;
}
