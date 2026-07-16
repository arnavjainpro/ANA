import { Download } from 'lucide-react';
import anaAvatar from '../assets/ana-avatar.png';
import { GithubIcon, XIcon, YoutubeIcon } from './icons';
import Reveal from './Reveal';

interface LinkColumn {
  heading: string;
  links: string[];
}

const columns: LinkColumn[] = [
  { heading: 'What we do', links: ['Features', 'Understand', 'Plan', 'Build'] },
  { heading: 'Who we are', links: ['About', 'Careers', 'Brand', 'Contact'] },
  { heading: 'Use Ana', links: ['macOS', 'Windows', 'Pricing', 'Changelog'] },
  { heading: 'Need help?', links: ['Docs', 'Contact support', 'Security', 'Status'] },
];

const socials = [
  { label: 'GitHub', icon: GithubIcon },
  { label: 'X', icon: XIcon },
  { label: 'YouTube', icon: YoutubeIcon },
];

export default function Footer() {
  return (
    <footer id="docs" className="bg-dark-base text-dark-textDim">
      <div className="mx-auto max-w-site px-6 md:px-10">
        <Reveal className="grid gap-10 py-16 lg:grid-cols-[1.2fr_repeat(4,1fr)]">
          <div>
            <a href="#" className="flex items-center gap-3">
              <img src={anaAvatar} alt="Ana logo" className="h-9 w-9 rounded-full object-cover" />
              <span className="text-xl font-bold tracking-tight text-dark-text">Ana</span>
            </a>
            <a
              href="#download"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Download
              <Download size={16} />
            </a>
          </div>

          {columns.map((column) => (
            <div key={column.heading}>
              <h3 className="mb-5 text-sm text-dark-textDim">{column.heading}</h3>
              <ul className="flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-base font-medium text-dark-text transition-colors hover:text-white"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>

        <div className="flex flex-col items-center justify-between gap-6 border-t border-dark-border py-6 text-sm md:flex-row">
          <div className="flex items-center gap-6">
            <span>© 2026 Ana</span>
            <a href="#" className="transition-colors hover:text-dark-text">
              Terms &amp; Privacy
            </a>
          </div>

          <div className="flex items-center gap-4">
            {socials.map(({ label, icon: Icon }) => (
              <a
                key={label}
                href="#"
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-dark-border transition-colors hover:border-dark-textDim hover:text-dark-text"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>

          <select
            defaultValue="en"
            aria-label="Language"
            className="rounded-full border border-dark-border bg-transparent px-5 py-2.5 text-sm text-dark-textDim"
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
          </select>
        </div>
      </div>
    </footer>
  );
}
