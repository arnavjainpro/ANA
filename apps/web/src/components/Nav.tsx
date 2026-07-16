import { ChevronRight, Download } from 'lucide-react';
import anaAvatar from '../assets/ana-avatar.png';

const links = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: '#docs' },
  { label: 'Blog', href: '#blog' },
];

export default function Nav() {
  return (
    <header className="sticky top-0 z-50 bg-paper-cream/90 backdrop-blur">
      <div className="mx-auto grid h-[5.7rem] max-w-site grid-cols-[1fr_auto_1fr] items-center px-6 md:px-10">
        <a href="#" className="flex items-center gap-3 justify-self-start">
          <img src={anaAvatar} alt="Ana logo" className="h-10 w-10 rounded-full object-cover" />
          <span className="text-2xl font-bold tracking-tight">Ana</span>
        </a>

        <nav className="hidden items-center gap-10 lg:flex">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[17px] font-medium text-ink transition-colors hover:text-ink-secondary"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4 justify-self-end">
          <a
            href="#"
            className="hidden items-center gap-2 rounded-full border border-ink/30 px-7 py-3 text-base font-medium transition-colors hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:inline-flex"
          >
            Log In
            <ChevronRight size={18} />
          </a>
          <a
            href="#download"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3 text-base font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Download
            <Download size={18} />
          </a>
        </div>
      </div>
    </header>
  );
}
