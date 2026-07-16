import anaAvatar from '../assets/ana-avatar.png';
import { AppleIcon, WindowsIcon } from './icons';
import Reveal from './Reveal';

function VoiceChip({ text, fromAna, className }: { text: string; fromAna: boolean; className: string }) {
  return (
    <div
      className={`absolute hidden items-center gap-3 rounded-2xl bg-white px-5 py-3 text-base shadow-lg ${className}`}
    >
      {fromAna ? (
        <img src={anaAvatar} alt="" className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <span className="h-9 w-9 rounded-full bg-paper-card" />
      )}
      <span className="text-ink-secondary">{text}</span>
      <span className="text-xs text-ink-tertiary">11:59</span>
    </div>
  );
}

export default function Hero() {
  return (
    <section id="download" className="pb-4 pt-2">
      <div className="mx-auto max-w-site px-6 md:px-10">
        <div className="relative flex min-h-[85vh] items-center overflow-hidden rounded-hero bg-gradient-to-br from-blue-100 via-paper-tint to-blue-200 p-8 md:p-16 lg:p-20">
          <span className="absolute inset-0 flex items-center justify-center text-sm font-medium uppercase tracking-widest text-ink-tertiary/50">
            Hero photo placeholder
          </span>

          <VoiceChip text="Add a login page" fromAna={false} className="bottom-[18%] left-[38%] rotate-[-2deg] xl:flex" />
          <VoiceChip text="On it. Here's the plan —" fromAna className="bottom-[7%] left-[44%] rotate-[1deg] xl:flex" />

          <div className="relative grid w-full items-center gap-12 lg:grid-cols-2">
            <Reveal className="max-w-2xl">
              <p className="mb-6 text-sm font-semibold uppercase tracking-wide text-accent">
                Voice-first coding for everyone
              </p>
              <h1 className="text-5xl font-bold tracking-tight md:text-6xl xl:text-7xl">
                Build software by talking
              </h1>
              <p className="mt-8 max-w-lg text-lg text-ink-secondary md:text-xl">
                Connect a GitHub repo and talk it through with Ana — a face-to-face AI partner
                that explains your code, plans your features, and builds them with you.
              </p>
            </Reveal>

            <Reveal
              delay="delay-150"
              className="w-full max-w-md rounded-[2rem] bg-black/45 p-8 text-white backdrop-blur-md md:p-10 lg:justify-self-end"
            >
              <h2 className="text-center text-2xl font-semibold">Download Ana</h2>
              <p className="mt-3 text-center text-base text-white/70">
                Free to try. No terminal required.
              </p>
              <div className="mt-8 flex flex-col gap-4">
                <a
                  href="#"
                  className="flex items-center justify-center gap-2.5 rounded-full bg-white px-6 py-4 text-base font-semibold text-ink transition-colors hover:bg-paper-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Download Ana for Mac"
                >
                  <AppleIcon className="h-5 w-5" />
                  Download for Mac
                </a>
                <a
                  href="#"
                  className="flex items-center justify-center gap-2.5 rounded-full border border-white/60 px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Download Ana for Windows"
                >
                  <WindowsIcon className="h-5 w-5" />
                  Download for Windows
                </a>
              </div>
              <p className="mt-6 text-center text-sm text-white/70">
                Also available for Apple Silicon and Windows ARM.
              </p>
            </Reveal>
          </div>
        </div>

        <p className="mt-4 text-right text-xs text-ink-tertiary">
          Ana runs on macOS 13+ and Windows 10+. Your code stays on your machine.
        </p>
      </div>
    </section>
  );
}
