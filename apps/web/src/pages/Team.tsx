import { Download } from 'lucide-react';
import anaAvatar from '../assets/ana-avatar.png';
import Reveal from '../components/Reveal';
import { GithubIcon, XIcon } from '../components/icons';

interface Founder {
  name: string;
  initial: string;
  bio: string;
}

const founders: Founder[] = [
  {
    name: 'Arnav',
    initial: 'A',
    bio: 'Builds the systems that let anyone talk their ideas into working software — no terminal required.',
  },
  {
    name: 'Nitin',
    initial: 'N',
    bio: 'Obsessed with the sub-second voice loop that makes Ana feel like a conversation, not a chatbot.',
  },
  {
    name: 'Aryan',
    initial: 'A',
    bio: 'Shapes how Ana explains, plans, and builds so that non-technical founders always stay in control.',
  },
];

function FounderCard({ founder }: { founder: Founder }) {
  return (
    <div className="flex flex-col items-center rounded-[2rem] bg-white p-8 text-center shadow-sm">
      <img src={anaAvatar} alt={founder.name} className="h-24 w-24 rounded-full object-cover shadow-md" />
      <h3 className="mt-6 text-2xl font-bold tracking-tight">{founder.name}</h3>
      <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-accent">Co-founder</p>
      <p className="mt-4 text-base text-ink-secondary">{founder.bio}</p>
      <div className="mt-6 flex items-center gap-3">
        <a
          href="#"
          aria-label={`${founder.name} on GitHub`}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/15 text-ink-secondary transition-colors hover:border-ink/40 hover:text-ink"
        >
          <GithubIcon className="h-4 w-4" />
        </a>
        <a
          href="#"
          aria-label={`${founder.name} on X`}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/15 text-ink-secondary transition-colors hover:border-ink/40 hover:text-ink"
        >
          <XIcon className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

export default function Team() {
  return (
    <main>
      <section className="mx-auto flex min-h-[55vh] max-w-6xl flex-col items-center justify-center px-6 py-24 text-center md:px-10">
        <Reveal>
          <p className="mb-5 text-sm font-semibold uppercase tracking-wide text-accent">Meet the team</p>
          <h1 className="text-5xl font-bold tracking-tight md:text-6xl">The three behind Ana</h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg text-ink-secondary md:text-xl">
            Ana started with three builders who believed anyone — not just engineers — should be
            able to create and understand software just by talking.
          </p>
        </Reveal>

        <Reveal delay="delay-150" className="mt-12">
          <p className="text-2xl font-semibold tracking-tight md:text-3xl">
            <span className="text-accent">A</span>rnav · <span className="text-accent">N</span>itin ·{' '}
            <span className="text-accent">A</span>ryan
          </p>
          <p className="mt-3 text-sm uppercase tracking-widest text-ink-tertiary">A + N + A = Ana</p>
        </Reveal>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 md:px-10">
        <div className="grid gap-8 md:grid-cols-3">
          {founders.map((founder, i) => (
            <Reveal key={founder.name} delay={i === 1 ? 'delay-150' : i === 2 ? 'delay-300' : ''}>
              <FounderCard founder={founder} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-32 text-center md:px-10">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Build alongside us</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-secondary">
            Ana is the tool we wished we had. Download it and start talking your next idea into
            existence.
          </p>
          <a
            href="/#download"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Download Ana
            <Download size={18} />
          </a>
        </Reveal>
      </section>
    </main>
  );
}
