import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { useRepoStore } from '../../store/repoStore';
import { isIpcError } from '../../lib/ipc';
import { Button, EmptyState, GithubIcon } from '../../components/ui';
import { SettingsCard, SettingsRow } from './SettingsRow';

/** Per-repo stored local working-copy paths — choose, change, or forget. */
export function ReposSection(): JSX.Element {
  const repos = useRepoStore((s) => s.repos);
  const connected = useRepoStore((s) => s.connected);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void window.ana.build.listRepoPaths().then((r) => setPaths(r.paths));
  }, []);

  async function handleChoose(fullName: string): Promise<void> {
    setBusy(fullName);
    const result = await window.ana.build.selectRepoPath(fullName);
    if (!isIpcError(result)) {
      setPaths((p) => ({ ...p, [fullName]: result.repoPath }));
    }
    setBusy(null);
  }

  async function handleForget(fullName: string): Promise<void> {
    setBusy(fullName);
    await window.ana.build.clearRepoPath(fullName);
    setPaths((p) => {
      const next = { ...p };
      delete next[fullName];
      return next;
    });
    setBusy(null);
  }

  if (!connected) {
    return (
      <EmptyState
        icon={<GithubIcon size={20} />}
        title="Connect GitHub first"
        description="Repos you connect will show up here with their local folder."
      />
    );
  }

  if (repos.length === 0) {
    return (
      <EmptyState
        icon={<FolderOpen size={20} strokeWidth={1.75} />}
        title="No repos yet"
        description="Pick a repo from the sidebar to see it here."
      />
    );
  }

  return (
    <SettingsCard>
      {repos.map((repo) => {
        const path = paths[repo.full_name];
        return (
          <SettingsRow
            key={repo.id}
            title={repo.full_name}
            description={path ?? 'No local folder chosen'}
            control={
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleChoose(repo.full_name)}
                  loading={busy === repo.full_name}
                >
                  {path ? 'Change' : 'Choose folder'}
                </Button>
                {path ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleForget(repo.full_name)}
                    disabled={busy === repo.full_name}
                  >
                    Forget
                  </Button>
                ) : null}
              </div>
            }
          />
        );
      })}
    </SettingsCard>
  );
}
