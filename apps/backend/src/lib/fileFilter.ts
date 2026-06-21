/** Decide whether a repo file should be indexed. */

const EXCLUDED_DIRS = ['node_modules/', '.git/', 'dist/', 'build/', 'out/', '.next/', 'coverage/'];

const EXCLUDED_EXTENSIONS = new Set([
  // binaries
  '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm', '.o', '.a', '.class',
  // images
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp', '.tiff',
  // media
  '.mp3', '.mp4', '.mov', '.avi', '.wav', '.webm', '.ogg',
  // archives
  '.zip', '.tar', '.gz', '.rar', '.7z',
  // fonts & docs
  '.woff', '.woff2', '.ttf', '.eot', '.pdf',
]);

const EXCLUDED_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot).toLowerCase();
}

export function isIndexable(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (EXCLUDED_DIRS.some((dir) => normalized.includes(dir))) return false;

  const base = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (EXCLUDED_FILES.has(base)) return false;

  const ext = extensionOf(normalized);
  if (ext === '.lock') return false;
  if (EXCLUDED_EXTENSIONS.has(ext)) return false;

  return true;
}
