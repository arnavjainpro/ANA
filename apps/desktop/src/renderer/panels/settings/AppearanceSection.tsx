import { Moon, Sun } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import type { ThemeName } from '../../theme/tokens';
import { SettingsCard, SettingsRow } from './SettingsRow';

const THEMES: { name: ThemeName; label: string; icon: typeof Moon }[] = [
  { name: 'dark', label: 'Dark', icon: Moon },
  { name: 'light', label: 'Light', icon: Sun },
];

/** App-wide dark/light theme toggle. */
export function AppearanceSection(): JSX.Element {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard>
        <SettingsRow
          title="Theme"
          description="Choose how Ana looks."
          control={
            <div
              role="radiogroup"
              aria-label="Theme"
              className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-base p-0.5"
            >
              {THEMES.map(({ name, label, icon: Icon }) => {
                const selected = theme === name;
                return (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTheme(name)}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150 ${
                      selected
                        ? 'bg-accent-muted text-accent-primary'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <Icon size={13} strokeWidth={1.75} aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>
          }
        />
      </SettingsCard>
    </div>
  );
}
