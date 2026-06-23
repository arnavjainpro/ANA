// Configure Monaco to load from the locally bundled package (not the jsDelivr
// CDN the default @monaco-editor/react loader uses) so it works under the app's
// strict Content-Security-Policy. Web workers are bundled by Vite via the
// `?worker` imports and run from blob URLs (allowed by `worker-src` in the CSP).

import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import type { Environment } from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

declare global {
  // eslint-disable-next-line no-var
  interface Window {
    MonacoEnvironment?: Environment;
  }
}

window.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

/** Best-effort mapping from a file extension to a Monaco language id. */
export function languageForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'cjs':
    case 'mjs':
      return 'javascript';
    case 'json':
      return 'json';
    case 'css':
      return 'css';
    case 'scss':
      return 'scss';
    case 'less':
      return 'less';
    case 'html':
      return 'html';
    case 'md':
      return 'markdown';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'java':
      return 'java';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'sh':
      return 'shell';
    default:
      return 'plaintext';
  }
}
