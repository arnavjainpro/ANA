import type { ReactNode } from 'react';
import { useInView } from '../hooks/useInView';

interface RevealProps {
  children: ReactNode;
  className?: string;
  // Pass a Tailwind delay utility literal (e.g. "delay-150") for staggering.
  delay?: string;
}

export default function Reveal({ children, className = '', delay = '' }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-emphasized ${delay} ${
        inView ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}
