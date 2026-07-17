import { useState } from 'react';
import { ArrowLeft, SlidersHorizontal, Palette, FolderGit2, Plug, Info } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import { GeneralSection } from './GeneralSection';
import { AppearanceSection } from './AppearanceSection';
import { ReposSection } from './ReposSection';
import { ToolsSection } from './ToolsSection';
import { AboutSection } from './AboutSection';

const SECTIONS = [
  { id: 'general', label: 'General', icon: SlidersHorizontal, render: GeneralSection },
  { id: 'appearance', label: 'Appearance', icon: Palette, render: AppearanceSection },
  { id: 'repos', label: 'Repos', icon: FolderGit2, render: ReposSection },
  { id: 'tools', label: 'Tools & MCPs', icon: Plug, render: ToolsSection },
  { id: 'about', label: 'About', icon: Info, render: AboutSection },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

// Frameless window: leave room for the OS window controls, same as TopBar.
const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

/**
 * Full-page settings view, opened from the sidebar account footer's gear
 * icon. Rendered as an overlay above the (still-mounted) main layout so the
 * live Tavus call inside AnaConversation is never torn down.
 */
export function SettingsView(): JSX.Element {
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const [activeId, setActiveId] = useState<SectionId>('general');
  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];
  const ActiveSection = active.render;

  return (
    <div
      role="dialog"
      aria-label="Settings"
      className="absolute inset-0 z-30 flex flex-col bg-surface-base"
    >
      <header
        className={`app-drag flex h-12 flex-shrink-0 items-center border-b border-surface-border bg-surface-raised ${
          IS_MAC ? 'pl-[78px] pr-3' : 'pl-3 pr-[140px]'
        }`}
      >
        <button
          type="button"
          onClick={() => setSettingsOpen(false)}
          className="app-no-drag flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary active:bg-surface-active"
        >
          <ArrowLeft size={15} strokeWidth={1.75} aria-hidden />
          Back
        </button>
        <span className="ml-3 text-sm font-semibold tracking-tight text-text-primary">Settings</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Settings sections"
          className="flex w-52 flex-shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-surface-border bg-surface-raised p-2"
        >
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const selected = id === activeId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveId(id)}
                aria-current={selected}
                className={`flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 ${
                  selected
                    ? 'bg-surface-active text-text-primary'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                <Icon size={15} strokeWidth={1.75} aria-hidden />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-2xl">
            <h1 className="mb-6 text-xl font-semibold text-text-primary">{active.label}</h1>
            <ActiveSection />
          </div>
        </div>
      </div>
    </div>
  );
}
