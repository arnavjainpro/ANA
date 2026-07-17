import { useState } from 'react';
import { useRepoStore } from '../../store/repoStore';
import { useBuildStore } from '../../store/buildStore';
import { Button, GithubIcon } from '../../components/ui';
import { SettingsCard, SettingsRow } from './SettingsRow';

/** GitHub account status + disconnect. */
export function GeneralSection(): JSX.Element {
  const connected = useRepoStore((s) => s.connected);
  const login = useRepoStore((s) => s.login);
  const disconnect = useRepoStore((s) => s.disconnect);
  const [busy, setBusy] = useState(false);

  async function handleDisconnect(): Promise<void> {
    setBusy(true);
    useBuildStore.getState().endSession();
    await window.ana.auth.disconnectGitHub();
    disconnect();
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard>
        <SettingsRow
          title="GitHub Account"
          description={
            connected && login ? `Connected as @${login}` : 'Connect a GitHub account to get started'
          }
          control={
            connected ? (
              <Button variant="danger" size="sm" onClick={handleDisconnect} loading={busy}>
                Disconnect
              </Button>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <GithubIcon size={13} />
                Not connected
              </span>
            )
          }
        />
      </SettingsCard>
    </div>
  );
}
