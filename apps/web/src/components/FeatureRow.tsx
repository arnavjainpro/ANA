import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import Reveal from './Reveal';

export interface FeatureRowProps {
  id?: string;
  eyebrow: string;
  title: string;
  accentWord?: string;
  body: string;
  linkLabel: string;
  mockup: ReactNode;
  reverse?: boolean;
  dark?: boolean;
}

function renderTitle(title: string, accentWord?: string): ReactNode {
  if (!accentWord || !title.includes(accentWord)) {
    return title;
  }
  const [before, after] = title.split(accentWord, 2) as [string, string];
  return (
    <>
      {before}
      <span className="text-accent">{accentWord}</span>
      {after}
    </>
  );
}

export default function FeatureRow({
  id,
  eyebrow,
  title,
  accentWord,
  body,
  linkLabel,
  mockup,
  reverse = false,
  dark = false,
}: FeatureRowProps) {
  return (
    <section id={id} className={dark ? 'bg-dark-base text-dark-text' : undefined}>
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 md:px-10 lg:min-h-[90vh] lg:grid-cols-2 lg:gap-12 lg:py-24">
        <Reveal className={`max-w-xl ${reverse ? 'lg:order-2 lg:justify-self-end' : ''}`}>
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-accent">{eyebrow}</p>
          <h2 className="text-4xl font-bold leading-[1.05] tracking-tight md:text-5xl">
            {renderTitle(title, accentWord)}
          </h2>
          <p className={`mt-7 max-w-lg text-lg md:text-xl ${dark ? 'text-dark-textDim' : 'text-ink-secondary'}`}>
            {body}
          </p>
          <a
            href="#"
            className={`mt-9 inline-flex items-center gap-1.5 text-base font-medium underline decoration-2 underline-offset-8 transition-colors md:text-lg ${
              dark ? 'text-dark-text hover:text-white' : 'text-ink hover:text-ink-secondary'
            }`}
          >
            {linkLabel}
            <ChevronRight size={20} />
          </a>
        </Reveal>
        <Reveal delay="delay-150" className={reverse ? 'lg:order-1' : ''}>
          {mockup}
        </Reveal>
      </div>
    </section>
  );
}
