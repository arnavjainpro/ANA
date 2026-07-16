import type { ReactNode } from 'react';

interface MockupFrameProps {
  children: ReactNode;
  dark?: boolean;
}

export default function MockupFrame({ children, dark = false }: MockupFrameProps) {
  return (
    <div
      className={`mx-auto flex min-h-[640px] w-full max-w-[420px] flex-col overflow-hidden rounded-[2.5rem] border-[6px] shadow-2xl ${
        dark ? 'border-dark-border bg-dark-raised' : 'border-ink/10 bg-white'
      }`}
    >
      <div
        className={`flex items-center gap-2 border-b px-5 py-4 ${
          dark ? 'border-dark-border' : 'border-paper-card'
        }`}
      >
        <span className="h-3.5 w-3.5 rounded-full bg-red-400" />
        <span className="h-3.5 w-3.5 rounded-full bg-yellow-400" />
        <span className="h-3.5 w-3.5 rounded-full bg-green-400" />
      </div>
      <div className="flex flex-1 flex-col p-6">{children}</div>
    </div>
  );
}
