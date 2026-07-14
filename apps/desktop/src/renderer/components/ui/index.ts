// Shared UI primitives.
//
// Icon convention (lucide-react):
//   - size={16} in headers/buttons, size={14} in dense rows (file tree, lists)
//   - strokeWidth={1.75} everywhere
//   - aria-hidden unless the icon is the only content (then the parent needs
//     an aria-label — IconButton enforces this via its required prop)
export { Button } from './Button';
export { IconButton } from './IconButton';
export { PanelHeader } from './PanelHeader';
export { EmptyState } from './EmptyState';
export { ErrorBanner } from './ErrorBanner';
export { Kbd } from './Kbd';
export { Spinner } from './Spinner';
export { GithubIcon } from './GithubIcon';
