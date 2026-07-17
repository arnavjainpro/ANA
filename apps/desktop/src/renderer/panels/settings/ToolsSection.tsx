import { Plug } from 'lucide-react';
import { EmptyState } from '../../components/ui';

/** Placeholder — Ana has no external tool/MCP integration yet. */
export function ToolsSection(): JSX.Element {
  return (
    <EmptyState
      icon={<Plug size={20} strokeWidth={1.75} />}
      title="Tool integrations are coming soon"
      description="Ana will be able to connect external tools and MCP servers here."
    />
  );
}
