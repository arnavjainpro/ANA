import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import anaAvatar from '../assets/ana-avatar.png';
import Reveal from './Reveal';

interface Post {
  title: string;
  excerpt: string;
}

const posts: Post[] = [
  {
    title: 'Introducing Ana: your voice-first coding partner',
    excerpt:
      'Meet Ana — connect a GitHub repo, start talking, and watch your ideas turn into explanations, plans, and working code. No terminal, no syntax, no gatekeeping…',
  },
  {
    title: 'How we hit sub-second voice latency',
    excerpt:
      'From your voice to Ana’s reply in under 1000ms, end to end. A look at the two-call pipeline, prompt caching, and the engineering behind a conversation that never lags…',
  },
  {
    title: 'From founder idea to shipped feature in an afternoon',
    excerpt:
      'A non-technical founder described a feature out loud at lunch. By 4pm it was reviewed, merged, and live. Here’s exactly how that conversation went…',
  },
];

const CARD_SCROLL = 544;

export default function BlogCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: -1 | 1) => {
    trackRef.current?.scrollBy({ left: direction * CARD_SCROLL, behavior: 'smooth' });
  };

  return (
    <section id="blog" className="px-4 pb-12 md:px-8">
      <div className="mx-auto grid max-w-[100rem] gap-10 rounded-band bg-accent-soft px-6 py-16 sm:px-8 md:px-16 lg:grid-cols-[1fr_2fr] lg:gap-16 lg:py-28">
        <Reveal className="flex flex-col">
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Stay up to date</h2>
          <p className="mt-6 max-w-md text-lg text-ink-secondary md:text-xl">
            Get the latest from Ana: news, useful tips, and new features to help you build with
            your voice.
          </p>
          <div className="mt-auto flex gap-4 pt-12">
            <button
              type="button"
              onClick={() => scroll(-1)}
              aria-label="Previous articles"
              className="flex h-14 w-14 items-center justify-center rounded-full border border-ink/30 bg-transparent transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              aria-label="Next articles"
              className="flex h-14 w-14 items-center justify-center rounded-full border border-ink/30 bg-transparent transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronRight size={22} />
            </button>
          </div>
        </Reveal>

        <div
          ref={trackRef}
          className="flex snap-x snap-mandatory gap-8 overflow-x-auto overflow-y-hidden scroll-smooth pb-4"
        >
          {posts.map((post, i) => (
            <Reveal
              key={post.title}
              delay={i === 1 ? 'delay-150' : i === 2 ? 'delay-300' : ''}
              className="flex min-h-[440px] w-[82vw] shrink-0 snap-start flex-col rounded-[2rem] bg-white p-8 sm:w-[420px] sm:p-10 md:w-[520px] lg:min-h-[480px]"
            >
              <img src={anaAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
              <h3 className="mt-8 text-2xl font-semibold leading-snug md:text-3xl">{post.title}</h3>
              <p className="mt-5 text-base text-ink-secondary md:text-lg">{post.excerpt}</p>
              <a
                href="#"
                className="mt-auto inline-block self-start rounded-full border border-ink px-6 py-3 text-base font-medium transition-colors hover:bg-paper-tint"
              >
                Read More
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
