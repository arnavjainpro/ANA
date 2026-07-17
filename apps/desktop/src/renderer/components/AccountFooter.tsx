import { Settings } from 'lucide-react';
import { useRepoStore } from '../store/repoStore';
import { useUiStore } from '../store/uiStore';
import { GithubIcon } from './ui';

/**
 * Sidebar footer: connected GitHub identity + a gear icon that opens the
 * full-page Settings view. Mirrors the account-row pattern from editors like
 * Cursor, scoped down to what Ana actually has to show.
 */
export function AccountFooter(): JSX.Element {
  const connected = useRepoStore((s) => s.connected);
  const login = useRepoStore((s) => s.login);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  return (
    <div className="mt-auto flex flex-shrink-0 items-center gap-2 border-t border-surface-border bg-surface-raised px-3 py-2">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-overlay text-text-tertiary">
        {connected && login ? (
          <img src={`https://github.com/${login}.png?size=64`} alt="" className="h-full w-full object-cover" />
        ) : (
          <GithubIcon size={14} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-xs font-medium text-text-primary">
          {connected && login ? login : 'Not connected'}
        </span>
        <span className="truncate text-[11px] text-text-tertiary">
          {connected ? 'Connected' : 'Sign in to get started'}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label="Open settings"
        title="Settings"
        className="flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary active:bg-surface-active"
      >
        <Settings size={15} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
