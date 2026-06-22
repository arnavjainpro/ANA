import { useEffect, useState, type ReactNode } from 'react';

/**
 * Fades its children in on mount (opacity 0 → 1, 200ms ease-out). Position and
 * size are never animated — opacity only — to stay friendly to motion
 * sensitivity. `prefers-reduced-motion` neutralises the transition globally.
 */
export function FadeIn({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // Flip on the next frame so the browser registers the 0 → 1 transition.
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`transition-opacity duration-200 ease-out ${
        shown ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}
