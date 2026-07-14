import { useEffect, useRef, useState, type ReactNode } from 'react';
import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import { useConversationStore } from '../../store/conversationStore';

// --- Mermaid initialization --------------------------------------------------
// ELK does the layout: it packs ranks far tighter than dagre and routes
// orthogonal edges with far fewer crossings/overlaps, which is most of the
// "legible at a glance" battle. `curve: 'step'` keeps edges as right-angle
// elbows; postProcessSvg then rounds the corners.
mermaid.registerLayoutLoaders(elkLayouts);
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  layout: 'elk',
  elk: {
    nodePlacementStrategy: 'NETWORK_SIMPLEX',
    mergeEdges: true,
  },
  themeVariables: {
    background: '#0d0d0f',
    primaryColor: '#182338',
    primaryBorderColor: '#3B6FCC',
    primaryTextColor: '#E6E8EC',
    lineColor: '#5A6072',
    edgeLabelBackground: '#131316',
    clusterBkg: '#131316',
    clusterBorder: '#2A2A38',
    fontFamily: 'Inter Variable, Inter, system-ui, sans-serif',
    fontSize: '15px',
    nodeBorder: '1.5px',
    nodeTextColor: '#E6E8EC',
  },
  flowchart: {
    htmlLabels: true,
    curve: 'step',
    // Spacing applies when the dagre renderer is used (old payloads / ELK
    // unavailable); ELK computes its own spacing.
    padding: 16,
    nodeSpacing: 45,
    rankSpacing: 60,
    useMaxWidth: false,
  },
  securityLevel: 'loose',
});

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_BACKGROUND = '#0d0d0f';
const SVG_EDGE_COLOR = '#5A6072';
const SVG_EDGE_LABEL = '#9AA0AE';
const HIGHLIGHT_COLOR = '#3B82F6';
const HIGHLIGHT_GLOW_COLOR = 'rgba(59,130,246,0.45)';
const ELBOW_RADIUS = 8;
// How far to fade nodes/edges that are not part of the focused slice.
const FOCUS_DIM_OPACITY = '0.12';
const FOCUS_FADE = 'opacity 220ms ease';

/**
 * The semantic node-type system. Ana tags each node with one of these classes
 * (:::service, :::datastore, …); post-processing maps the class to a colour and
 * an inline SVG icon, so every node reads as a typed Lucidchart shape-card.
 * Icon paths are 24×24 lucide-style strokes.
 */
interface NodeType {
  fill: string;
  border: string;
  accent: string;
  icon: string[];
}

const NODE_TYPES: Record<string, NodeType> = {
  entrypoint: {
    fill: '#14233D',
    border: '#3B82F6',
    accent: '#7DB0FF',
    icon: ['M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4', 'M10 17l5-5-5-5', 'M15 12H3'],
  },
  service: {
    fill: '#1B1933',
    border: '#7C6FF0',
    accent: '#B4A8FF',
    icon: [
      'M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z',
      'M4 15a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z',
      'M8 7h.01M8 17h.01',
    ],
  },
  datastore: {
    fill: '#13241B',
    border: '#2D8B5A',
    accent: '#6EE7B7',
    icon: [
      'M12 5c4.4 0 8 1.1 8 2.5S16.4 10 12 10 4 8.9 4 7.5 7.6 5 12 5z',
      'M4 7.5v9C4 17.9 7.6 19 12 19s8-1.1 8-2.5v-9',
      'M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5',
    ],
  },
  external: {
    fill: '#2A2110',
    border: '#D97706',
    accent: '#FCD34D',
    icon: ['M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6 19h11.5z'],
  },
  module: {
    fill: '#1A1D23',
    border: '#5B6577',
    accent: '#CBD5E1',
    icon: ['M14 3v5h5', 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'],
  },
  decision: {
    fill: '#2A1320',
    border: '#DB2777',
    accent: '#F9A8D4',
    icon: [
      'M6 3v12',
      'M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
      'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
      'M18 9a9 9 0 0 1-9 9',
    ],
  },
};

const DEFAULT_TYPE: NodeType = {
  fill: '#181B21',
  border: '#3B6FCC',
  accent: '#93C5FD',
  icon: NODE_TYPES.module!.icon,
};

let renderSeq = 0;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

type DiagramView = 'overview' | 'focus' | 'detail';

interface DiagramPanelProps {
  mermaid: string;
  isLoading: boolean;
  highlightedNodes?: string[];
  /** Which view is showing: the whole map, a focused slice of it, or a
   *  per-component detail map. Defaults to 'overview'. */
  view?: DiagramView;
  /** The component a focus/detail view is about; null for the overview. */
  focusSubject?: string | null;
  /** Invoked by the "back to overview" breadcrumb. */
  onBackToOverview?: () => void;
}

// --- Toolbar icons -----------------------------------------------------------
function Icon({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg
      className="size-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ZoomInIcon = (): JSX.Element => (
  <Icon>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
    <path d="M11 8v6" />
    <path d="M8 11h6" />
  </Icon>
);

const ZoomOutIcon = (): JSX.Element => (
  <Icon>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
    <path d="M8 11h6" />
  </Icon>
);

const Maximize2Icon = (): JSX.Element => (
  <Icon>
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <path d="M21 3 14 10" />
    <path d="M3 21 10 14" />
  </Icon>
);

const CopyIcon = (): JSX.Element => (
  <Icon>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Icon>
);

const CheckIcon = (): JSX.Element => (
  <Icon>
    <polyline points="20 6 9 17 4 12" />
  </Icon>
);

const GitBranchIcon = (): JSX.Element => (
  <svg
    className="size-12 text-surface-border"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

function diagramTypeLabel(code: string): string {
  const head = code.trimStart();
  // Canonical diagrams are all "flowchart LR" now — architecture maps, not flows.
  if (head.startsWith('flowchart') || head.startsWith('graph')) return 'Architecture';
  return 'File Structure';
}

// --- Live speech → node matching ---------------------------------------------
// As Tavus speaks, we match each utterance against the rendered node labels and
// highlight the mentioned node. Matching is done on a "squashed" form (lowercase,
// alphanumerics only) so spoken "Eleven Labs" lines up with a label like
// "ElevenLabs API". Generic role words are stripped to form a "core" keyword so
// a node still matches when Ana omits the suffix ("the voice interface").

interface NodeEntry {
  id: string;
  label: string;
  squashed: string; // full label, squashed
  core: string; // label minus generic role words, squashed
}

const GENERIC_WORDS = new Set([
  'api', 'service', 'services', 'process', 'panel', 'component', 'store', 'db',
  'database', 'module', 'client', 'server', 'app', 'ui', 'page', 'view', 'handler',
  'manager', 'provider', 'context', 'hook', 'util', 'utils', 'lib', 'the', 'a',
]);

function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function coreKeyword(label: string): string {
  const tokens = label
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '') // drop a file extension
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const kept = tokens.filter((t) => !GENERIC_WORDS.has(t));
  return (kept.length ? kept : tokens).join('');
}

/** Resolve which node an utterance is talking about; longest + latest match wins. */
function matchNode(utterance: string, entries: NodeEntry[]): string | null {
  const u = squash(utterance);
  if (!u) return null;
  let bestId: string | null = null;
  let bestScore = -1;
  for (const e of entries) {
    for (const key of [e.squashed, e.core]) {
      if (key.length < 3) continue;
      const pos = u.lastIndexOf(key);
      if (pos >= 0) {
        // Prefer a longer (more specific) match, then a later position.
        const score = key.length * 100000 + pos;
        if (score > bestScore) {
          bestScore = score;
          bestId = e.id;
        }
        break;
      }
    }
  }
  return bestId;
}

/** Length of the shared leading run of two strings. */
function commonPrefixLen(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Resolve a spoken subject ("the authentication part") to a rendered node id.
 * First tries the strict substring matcher; if that misses, falls back to the
 * node sharing the longest leading run with the subject (>= 4 chars), so loose
 * paraphrases like "authentication" still land on a node such as "AuthService".
 */
function resolveSubjectNode(subject: string, entries: NodeEntry[]): string | null {
  // Canonical diagrams use stable snake_case module ids — try an exact (then
  // substring) id match first, so "backend services" lands on
  // apps_backend_src_services without any label heuristics.
  const subjId = squash(subject);
  if (subjId.length >= 3) {
    const byId =
      entries.find((e) => squash(e.id) === subjId) ??
      entries.find((e) => squash(e.id).includes(subjId));
    if (byId) return byId.id;
  }

  const strict = matchNode(subject, entries);
  if (strict) return strict;

  const subj = squash(subject);
  if (subj.length < 4) return null;
  let bestId: string | null = null;
  let bestLen = 3; // require at least 4 shared leading chars
  for (const e of entries) {
    const len = Math.max(commonPrefixLen(subj, e.squashed), commonPrefixLen(subj, e.core));
    if (len > bestLen) {
      bestLen = len;
      bestId = e.id;
    }
  }
  return bestId;
}

/**
 * Read an edge path's endpoints. Dagre-rendered SVGs carry `LS-<source>` /
 * `LE-<target>` classes; ELK-rendered ones only encode endpoints in the edge id
 * (`<renderId>-L_<source>_<target>_<n>`). Since node ids may themselves contain
 * underscores (snake_case module ids), the id form is disambiguated against the
 * set of node ids actually present in the diagram.
 */
function edgeEndpoints(
  el: Element,
  knownIds?: readonly string[],
): { source: string | null; target: string | null } {
  let source: string | null = null;
  let target: string | null = null;
  el.classList.forEach((cls) => {
    if (cls.startsWith('LS-')) source = cls.slice(3);
    else if (cls.startsWith('LE-')) target = cls.slice(3);
  });
  if (source || target || !knownIds?.length) return { source, target };

  const m = (el.getAttribute('id') ?? '').match(/(?:^|-)L_(.+)_\d+$/);
  if (!m) return { source: null, target: null };
  const body = m[1]!;
  let best: { source: string; target: string } | null = null;
  for (const id of knownIds) {
    if (!body.startsWith(`${id}_`)) continue;
    const rest = body.slice(id.length + 1);
    if (knownIds.includes(rest) && (!best || id.length > best.source.length)) {
      best = { source: id, target: rest };
    }
  }
  return best ?? { source: null, target: null };
}

/** All node ids currently rendered in the container. */
function renderedNodeIds(container: Element): string[] {
  const ids: string[] = [];
  container.querySelectorAll('[data-node-id]').forEach((el) => {
    const id = el.getAttribute('data-node-id');
    if (id) ids.push(id);
  });
  return ids;
}

/** The node IDs directly connected to `subjectId` by an edge, plus the subject. */
function focusKeepSet(container: Element, subjectId: string): Set<string> {
  const keep = new Set<string>([subjectId]);
  const ids = renderedNodeIds(container);
  container.querySelectorAll<SVGElement>('.edgePath path, path.flowchart-link, .flowchart-link').forEach((el) => {
    const { source, target } = edgeEndpoints(el, ids);
    if (source === subjectId && target) keep.add(target);
    else if (target === subjectId && source) keep.add(source);
  });
  return keep;
}

/** Read the semantic type from a node's CSS classes, else fall back. */
function nodeTypeOf(el: Element): NodeType {
  for (const key of Object.keys(NODE_TYPES)) {
    if (el.classList.contains(key)) return NODE_TYPES[key]!;
  }
  return DEFAULT_TYPE;
}

/**
 * Re-route an orthogonal SVG path (pure M/L commands) so each corner is a
 * rounded quarter-turn instead of a hard 90°. Bails (returns the original) if
 * the path contains anything other than M/L, so it never corrupts curves.
 */
function roundCorners(d: string, r: number): string {
  const tokens = d.match(/[MLml][^MLmlCcSsQqTtAaHhVvZz]*/g);
  if (!tokens) return d;
  const pts: Array<[number, number]> = [];
  for (const tok of tokens) {
    const cmd = tok[0]!.toUpperCase();
    if (cmd !== 'M' && cmd !== 'L') return d; // contains curves/arcs — leave alone
    const nums = tok.slice(1).trim().split(/[\s,]+/).map(Number);
    if (nums.length < 2 || nums.some(Number.isNaN)) return d;
    pts.push([nums[0]!, nums[1]!]);
  }
  if (pts.length < 3) return d;

  let out = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const v1: [number, number] = [p0[0] - p1[0], p0[1] - p1[1]];
    const v2: [number, number] = [p2[0] - p1[0], p2[1] - p1[1]];
    const len1 = Math.hypot(v1[0], v1[1]) || 1;
    const len2 = Math.hypot(v2[0], v2[1]) || 1;
    const rr = Math.min(r, len1 / 2, len2 / 2);
    const a: [number, number] = [p1[0] + (v1[0] / len1) * rr, p1[1] + (v1[1] / len1) * rr];
    const b: [number, number] = [p1[0] + (v2[0] / len2) * rr, p1[1] + (v2[1] / len2) * rr];
    out += ` L ${a[0].toFixed(2)} ${a[1].toFixed(2)} Q ${p1[0]} ${p1[1]} ${b[0].toFixed(2)} ${b[1].toFixed(2)}`;
  }
  const last = pts[pts.length - 1]!;
  out += ` L ${last[0]} ${last[1]}`;
  return out;
}

/** Build a small icon group (lucide-style stroke paths) at the badge origin. */
function makeIcon(doc: Document, paths: string[], color: string): SVGGElement {
  const g = doc.createElementNS(SVG_NS, 'g') as SVGGElement;
  // 24×24 source → ~13px badge: scale 0.55, recentre on (0,0).
  g.setAttribute('transform', 'translate(-6.6,-6.6) scale(0.55)');
  for (const d of paths) {
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', '2.2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    g.appendChild(p);
  }
  return g;
}

/** Inject the defs (drop-shadow + highlight-glow filters) once per SVG. */
function buildDefs(doc: Document, defs: Element): void {
  if (!doc.getElementById('ana-node-glow')) {
    const f = doc.createElementNS(SVG_NS, 'filter');
    f.setAttribute('id', 'ana-node-glow');
    f.setAttribute('x', '-25%');
    f.setAttribute('y', '-25%');
    f.setAttribute('width', '150%');
    f.setAttribute('height', '160%');
    const shadow = doc.createElementNS(SVG_NS, 'feDropShadow');
    shadow.setAttribute('dx', '0');
    shadow.setAttribute('dy', '3');
    shadow.setAttribute('stdDeviation', '4');
    shadow.setAttribute('flood-color', '#000000');
    shadow.setAttribute('flood-opacity', '0.45');
    f.appendChild(shadow);
    defs.appendChild(f);
  }

  if (!doc.getElementById('ana-highlight-glow')) {
    const f = doc.createElementNS(SVG_NS, 'filter');
    f.setAttribute('id', 'ana-highlight-glow');
    f.setAttribute('x', '-40%');
    f.setAttribute('y', '-40%');
    f.setAttribute('width', '180%');
    f.setAttribute('height', '180%');
    const blur = doc.createElementNS(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', '5');
    blur.setAttribute('result', 'blur');
    const flood = doc.createElementNS(SVG_NS, 'feFlood');
    flood.setAttribute('flood-color', HIGHLIGHT_GLOW_COLOR);
    flood.setAttribute('result', 'color');
    const composite = doc.createElementNS(SVG_NS, 'feComposite');
    composite.setAttribute('in', 'color');
    composite.setAttribute('in2', 'blur');
    composite.setAttribute('operator', 'in');
    composite.setAttribute('result', 'glow');
    const merge = doc.createElementNS(SVG_NS, 'feMerge');
    const mg1 = doc.createElementNS(SVG_NS, 'feMergeNode');
    mg1.setAttribute('in', 'glow');
    const mg2 = doc.createElementNS(SVG_NS, 'feMergeNode');
    mg2.setAttribute('in', 'SourceGraphic');
    merge.appendChild(mg1);
    merge.appendChild(mg2);
    f.append(blur, flood, composite, merge);
    defs.appendChild(f);
  }
}

/**
 * Post-process Mermaid's raw SVG into the Lucidchart-grade Ana look: typed
 * node shape-cards with inline icons, rounded orthogonal connectors, pill edge
 * labels, and titled container cards. Returns the serialized SVG string.
 */
function postProcessSvg(svgString: string): string {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return svgString;

  // Give the SVG its intrinsic pixel size from the viewBox so the zoom library
  // can measure and fit it (a 100% SVG self-fits and can't be centered).
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    const vbW = parts[2] ?? 0;
    const vbH = parts[3] ?? 0;
    if (vbW > 0 && vbH > 0) {
      svg.setAttribute('width', String(vbW));
      svg.setAttribute('height', String(vbH));
    }
  }
  (svg as SVGElement).style.maxWidth = 'none';

  // Drop Mermaid's opaque background rect so the dot-grid canvas shows through.
  const firstRect = svg.querySelector('rect');
  if (firstRect) {
    const fill = (firstRect.getAttribute('fill') ?? '').toLowerCase();
    if (fill === SVG_BACKGROUND.toLowerCase() || fill === '#ffffff' || fill === 'white') {
      firstRect.remove();
    }
  }

  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS(SVG_NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  buildDefs(doc, defs);

  // --- Nodes: typed shape-cards + corner icon badge ---
  svg.querySelectorAll<SVGGElement>('.node').forEach((nodeEl) => {
    // Dagre ids look like "flowchart-AuthService-0"; ELK prefixes the render id
    // too: "ana-diagram-3-flowchart-auth_service-0". Strip both wrappers.
    const rawId = nodeEl.getAttribute('id') ?? '';
    const nodeId = rawId.replace(/^.*?flowchart-/, '').replace(/-\d+$/, '');
    if (nodeId) nodeEl.setAttribute('data-node-id', nodeId);

    const type = nodeTypeOf(nodeEl);
    const shape = nodeEl.querySelector<SVGElement>('rect, polygon, path');
    if (!shape) return;

    shape.setAttribute('fill', type.fill);
    shape.setAttribute('stroke', type.border);
    shape.setAttribute('stroke-width', '1.5');
    // Altitude hierarchy: only entry points and datastores get a drop-shadow,
    // so the eye lands on where flow starts and where data lives.
    const raised =
      nodeEl.classList.contains('entrypoint') || nodeEl.classList.contains('datastore');
    const baseFilter = raised ? 'url(#ana-node-glow)' : 'none';
    shape.setAttribute('data-base-filter', baseFilter);
    (shape as SVGElement).style.filter = baseFilter;

    // Rounded corners for rectangles — but leave stadium pills (large rx) alone.
    if (shape.tagName.toLowerCase() === 'rect') {
      const h = parseFloat(shape.getAttribute('height') ?? '0');
      const curRx = parseFloat(shape.getAttribute('rx') ?? '0');
      if (h > 0 && curRx < h / 2) {
        shape.setAttribute('rx', '8');
        shape.setAttribute('ry', '8');
      }
      // Corner icon badge, straddling the rect's top-left corner.
      const x = parseFloat(shape.getAttribute('x') ?? 'NaN');
      const y = parseFloat(shape.getAttribute('y') ?? 'NaN');
      const w = parseFloat(shape.getAttribute('width') ?? '0');
      if (!Number.isNaN(x) && !Number.isNaN(y) && w > 0) {
        const badge = doc.createElementNS(SVG_NS, 'g');
        badge.setAttribute('transform', `translate(${x + 13}, ${y + 13})`);
        badge.setAttribute('pointer-events', 'none');
        const circle = doc.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('r', '10');
        circle.setAttribute('fill', '#101015');
        circle.setAttribute('stroke', type.border);
        circle.setAttribute('stroke-width', '1.2');
        badge.appendChild(circle);
        badge.appendChild(makeIcon(doc, type.icon, type.accent));
        nodeEl.appendChild(badge);
      }
    }
  });

  // --- Edges: rounded orthogonal connectors ---
  svg.querySelectorAll<SVGElement>('.edgePath path, .flowchart-link').forEach((el) => {
    const d = el.getAttribute('d');
    if (d) el.setAttribute('d', roundCorners(d, ELBOW_RADIUS));
    el.setAttribute('stroke', SVG_EDGE_COLOR);
    el.setAttribute('stroke-width', '1.5');
    el.setAttribute('stroke-opacity', '0.85');
    el.setAttribute('fill', 'none');
  });

  svg.querySelectorAll<SVGElement>('marker path, marker polygon').forEach((el) => {
    el.setAttribute('fill', SVG_EDGE_COLOR);
    el.setAttribute('stroke', SVG_EDGE_COLOR);
  });

  // --- Edge labels: pill chips (ellipsised so long labels never smear across
  //     neighbouring edges) ---
  svg.querySelectorAll<SVGElement>('.edgeLabel rect, .edgeLabels rect').forEach((el) => {
    el.setAttribute('fill', '#15151b');
    el.setAttribute('rx', '5');
    el.setAttribute('ry', '5');
    el.setAttribute('stroke', '#26262F');
    el.setAttribute('stroke-width', '1');
  });
  svg.querySelectorAll<SVGElement & HTMLElement>('.edgeLabel, .edgeLabel span, .edgeLabel p').forEach((el) => {
    el.style.fontSize = '11px';
    el.style.fontWeight = '500';
    el.style.color = SVG_EDGE_LABEL;
    el.style.fill = SVG_EDGE_LABEL;
    el.style.background = 'transparent';
  });
  svg.querySelectorAll<SVGElement & HTMLElement>('.edgeLabel span').forEach((el) => {
    el.style.display = 'inline-block';
    el.style.maxWidth = '140px';
    el.style.overflow = 'hidden';
    el.style.textOverflow = 'ellipsis';
    el.style.whiteSpace = 'nowrap';
  });

  // --- Subgraph containers: layer cards, tinted per cluster so adjacent
  //     layers read as distinct bands ---
  const clusterTints = [
    { fill: '#12141C', stroke: '#2C3040' },
    { fill: '#14121A', stroke: '#332C40' },
    { fill: '#101715', stroke: '#293B33' },
    { fill: '#171310', stroke: '#403428' },
  ];
  svg.querySelectorAll<SVGElement>('.cluster').forEach((cluster, i) => {
    const tint = clusterTints[i % clusterTints.length]!;
    cluster.querySelectorAll<SVGElement>('rect').forEach((el) => {
      el.setAttribute('fill', tint.fill);
      el.setAttribute('stroke', tint.stroke);
      el.setAttribute('stroke-width', '1.25');
      el.setAttribute('rx', '14');
      el.setAttribute('ry', '14');
    });
  });
  svg.querySelectorAll<SVGElement & HTMLElement>('.cluster .label, .cluster text, .cluster span, .cluster p').forEach((el) => {
    el.style.fill = '#8B92A4';
    el.style.color = '#8B92A4';
    el.style.fontSize = '10.5px';
    el.style.fontWeight = '700';
    el.style.letterSpacing = '0.1em';
    el.style.textTransform = 'uppercase';
  });

  // --- Node label typography ---
  svg.querySelectorAll<SVGElement & HTMLElement>('.node .label, .node text, .nodeLabel, .nodeLabel p').forEach((el) => {
    el.style.fontFamily = 'Inter Variable, Inter, system-ui, sans-serif';
    el.style.fontWeight = '600';
    el.style.letterSpacing = '-0.01em';
    el.style.fill = '#E6E8EC';
    el.style.color = '#E6E8EC';
  });

  return new XMLSerializer().serializeToString(svg);
}

/** Renders the Understand-mode Mermaid diagram with pan/zoom, Lucidchart styling, and node highlighting. */
export function DiagramPanel({
  mermaid: code,
  isLoading,
  highlightedNodes,
  view = 'overview',
  focusSubject = null,
  onBackToOverview,
}: DiagramPanelProps): JSX.Element {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const prevCode = useRef<string | null>(null);
  const [svg, setSvg] = useState('');
  const [hasError, setHasError] = useState(false);
  const [visible, setVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  // The node currently highlighted, by data-node-id. Driven by live speech when
  // a call is active, else by the timed fallback cycle.
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  // Index of rendered node labels (rebuilt per diagram) used to match speech.
  const nodeIndexRef = useRef<NodeEntry[]>([]);
  // True once a live utterance has matched a node — disables the fallback cycle
  // so live speech, not the timer, owns the highlight for the rest of the call.
  const hasLiveRef = useRef(false);

  const liveUtterance = useConversationStore((s) => s.liveUtterance);
  const lastSpoken = useConversationStore((s) => s.lastSpoken);
  const diagramHistory = useConversationStore((s) => s.diagramHistory);
  const activeHistoryId = useConversationStore((s) => s.activeHistoryId);
  const selectHistoryDiagram = useConversationStore((s) => s.selectHistoryDiagram);

  const trimmed = code.trim();

  useEffect(() => {
    let cancelled = false;
    const previous = prevCode.current;
    prevCode.current = code;

    const swap = async (): Promise<void> => {
      if (!trimmed) {
        if (!cancelled) {
          setSvg('');
          setHasError(false);
        }
        return;
      }
      try {
        const id = `ana-diagram-${(renderSeq += 1)}`;
        const { svg: raw } = await mermaid.render(id, trimmed);
        if (cancelled) return;
        setSvg(postProcessSvg(raw));
        setHasError(false);
        setActiveNodeId(null);
      } catch (err) {
        if (cancelled) return;
        console.error('[DiagramPanel] invalid Mermaid diagram:', code, err);
        setSvg('');
        setHasError(true);
      }
    };

    const isChange = previous !== null && previous !== code;
    if (!isChange || prefersReducedMotion()) {
      void swap().then(() => {
        if (!cancelled) setVisible(true);
      });
      return () => { cancelled = true; };
    }

    setVisible(false);
    const timer = window.setTimeout(() => {
      void swap().then(() => {
        if (!cancelled) setVisible(true);
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, trimmed]);

  // Resolve the focus subject (a spoken name like "Auth API") to a rendered
  // node id, and the set of nodes to keep visible (it + its direct neighbours).
  // Reads the live DOM rather than nodeIndexRef so it is correct on a fresh SVG
  // regardless of effect ordering. Returns null when there's nothing to focus.
  const resolveFocusTarget = (): { subjectId: string; keep: Set<string> } | null => {
    const container = svgContainerRef.current;
    if (!container || view !== 'focus' || !focusSubject) return null;
    const entries: NodeEntry[] = [];
    container.querySelectorAll<SVGElement>('[data-node-id]').forEach((el) => {
      const id = el.getAttribute('data-node-id');
      if (!id) return;
      const labelEl = el.querySelector('.nodeLabel, .label');
      const label = (labelEl?.textContent ?? id).trim();
      entries.push({ id, label, squashed: squash(label), core: coreKeyword(label) });
    });
    const subjectId = resolveSubjectNode(focusSubject, entries);
    if (!subjectId) return null;
    return { subjectId, keep: focusKeepSet(container, subjectId) };
  };

  // Dim everything outside the focused slice (or restore all when keep is null).
  const applyFocusDim = (
    container: Element,
    keep: Set<string> | null,
    subjectId: string | null,
  ): void => {
    container.querySelectorAll<SVGElement>('[data-node-id]').forEach((el) => {
      const id = el.getAttribute('data-node-id');
      const dim = keep !== null && (!id || !keep.has(id));
      el.style.transition = FOCUS_FADE;
      el.style.opacity = dim ? FOCUS_DIM_OPACITY : '';
    });
    const ids = renderedNodeIds(container);
    container
      .querySelectorAll<SVGElement>('.edgePath path, path.flowchart-link, .flowchart-link')
      .forEach((el) => {
        let dim = false;
        if (keep !== null && subjectId) {
          const { source, target } = edgeEndpoints(el, ids);
          dim = !(source === subjectId || target === subjectId);
        }
        el.style.transition = FOCUS_FADE;
        el.style.opacity = dim ? FOCUS_DIM_OPACITY : '';
      });
  };

  // Zoom/center on the kept nodes, keeping their on-screen positions identical to
  // the overview (we only change the viewport, never the layout).
  const zoomToKeep = (keep: Set<string>): void => {
    const api = transformRef.current;
    const container = svgContainerRef.current;
    if (!api || !container) return;
    const wrapperEl = container.closest('.react-transform-wrapper');
    if (!wrapperEl) return;
    const wrapRect = wrapperEl.getBoundingClientRect();
    const s0 = api.state.scale || 1;
    const px0 = api.state.positionX || 0;
    const py0 = api.state.positionY || 0;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    keep.forEach((id) => {
      const el = container.querySelector<SVGElement>(`[data-node-id="${CSS.escape(id)}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      minX = Math.min(minX, r.left);
      minY = Math.min(minY, r.top);
      maxX = Math.max(maxX, r.right);
      maxY = Math.max(maxY, r.bottom);
    });
    if (!Number.isFinite(minX)) {
      fitView(300);
      return;
    }

    // Screen px → content coords (undo the current pan/zoom).
    const cMinX = (minX - wrapRect.left - px0) / s0;
    const cMinY = (minY - wrapRect.top - py0) / s0;
    const cMaxX = (maxX - wrapRect.left - px0) / s0;
    const cMaxY = (maxY - wrapRect.top - py0) / s0;
    const bw = Math.max(1, cMaxX - cMinX);
    const bh = Math.max(1, cMaxY - cMinY);
    const fit = Math.min(wrapRect.width / bw, wrapRect.height / bh) * 0.82;
    const scale = Math.max(0.4, Math.min(2.6, fit));
    const cx = (cMinX + cMaxX) / 2;
    const cy = (cMinY + cMaxY) / 2;
    api.setTransform(wrapRect.width / 2 - cx * scale, wrapRect.height / 2 - cy * scale, scale, 300);
  };

  // After each render — and whenever the focus changes — either dim+zoom to the
  // focused slice, or restore the full map and fit it. The overview and detail
  // views both show their whole diagram; only 'focus' filters.
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!svg || !container) return undefined;
    const target = resolveFocusTarget();
    applyFocusDim(container, target?.keep ?? null, target?.subjectId ?? null);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (target) zoomToKeep(target.keep);
        else fitView(0);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg, view, focusSubject]);

  // Build the node-label index from the freshly rendered SVG, and reset the
  // live-driver flag so the new diagram starts on the fallback cycle until the
  // replica speaks about it.
  useEffect(() => {
    hasLiveRef.current = false;
    const container = svgContainerRef.current;
    if (!container || !svg) {
      nodeIndexRef.current = [];
      return;
    }
    const entries: NodeEntry[] = [];
    container.querySelectorAll<SVGElement>('[data-node-id]').forEach((nodeEl) => {
      const id = nodeEl.getAttribute('data-node-id');
      if (!id) return;
      const labelEl = nodeEl.querySelector('.nodeLabel, .label');
      const label = (labelEl?.textContent ?? id).trim();
      entries.push({ id, label, squashed: squash(label), core: coreKeyword(label) });
    });
    nodeIndexRef.current = entries;
  }, [svg]);

  // Live speech drives the highlight: when the replica utters a new line, match
  // it to a node and highlight that node. Marks live mode active on first match.
  useEffect(() => {
    if (!liveUtterance?.text) return;
    const matched = matchNode(liveUtterance.text, nodeIndexRef.current);
    if (matched) {
      hasLiveRef.current = true;
      setActiveNodeId(matched);
    }
  }, [liveUtterance]);

  // Primary driver: walk the highlight through the nodes named in Ana's spoken
  // reply, paced at natural speaking rate. Tavus gives us no per-word transcript,
  // but the full spoken text arrives with the diagram — so we split it into
  // sentences, map each to the node it mentions, and dwell on each node for a
  // duration proportional to its sentence's length (~speaking rate). A short
  // lead-in accounts for TTS start-up. If a real live utterance ever arrives it
  // sets hasLiveRef and this scheduler yields. If nothing in the speech maps to
  // a node, fall back to a uniform cycle through the backend's highlightedNodes.
  useEffect(() => {
    if (!svg || hasLiveRef.current) return undefined;
    const entries = nodeIndexRef.current;

    // Build the ordered (node, dwell) schedule from the spoken sentences.
    const schedule: Array<{ id: string; dwell: number }> = [];
    if (lastSpoken && entries.length) {
      const sentences = lastSpoken.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
      for (const sentence of sentences) {
        const id = matchNode(sentence, entries);
        if (id && schedule[schedule.length - 1]?.id !== id) {
          const words = sentence.split(/\s+/).length;
          schedule.push({ id, dwell: Math.max(1300, Math.round(words * 360)) });
        }
      }
    }

    const timers: number[] = [];
    if (schedule.length) {
      let idx = 0;
      const step = (): void => {
        if (hasLiveRef.current || idx >= schedule.length) return;
        const item = schedule[idx]!;
        setActiveNodeId(item.id);
        idx += 1;
        if (idx < schedule.length) timers.push(window.setTimeout(step, item.dwell));
      };
      timers.push(window.setTimeout(step, 400)); // brief TTS lead-in
    } else if (highlightedNodes?.length) {
      // Last resort: uniform cycle through the backend-provided node list.
      let i = 0;
      setActiveNodeId((cur) => cur ?? highlightedNodes[0] ?? null);
      const interval = window.setInterval(() => {
        if (hasLiveRef.current) return;
        i = (i + 1) % highlightedNodes.length;
        setActiveNodeId(highlightedNodes[i] ?? null);
      }, 2500);
      timers.push(interval);
    }

    return () => timers.forEach((t) => { window.clearTimeout(t); window.clearInterval(t); });
  }, [lastSpoken, highlightedNodes, svg]);

  // Apply/remove the highlight ring directly on the SVG DOM.
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;

    container.querySelectorAll<SVGElement>('[data-node-id]').forEach((nodeEl) => {
      const shape = nodeEl.querySelector<SVGElement>('rect, polygon, path');
      if (!shape) return;
      const orig = shape.getAttribute('data-orig-stroke');
      const origWidth = shape.getAttribute('data-orig-stroke-width');
      if (orig !== null) shape.setAttribute('stroke', orig);
      if (origWidth !== null) shape.setAttribute('stroke-width', origWidth);
      shape.style.filter = shape.getAttribute('data-base-filter') ?? 'none';
    });

    if (!activeNodeId) return;
    const nodeEl = container.querySelector<SVGElement>(`[data-node-id="${CSS.escape(activeNodeId)}"]`);
    if (!nodeEl) return;
    const shape = nodeEl.querySelector<SVGElement>('rect, polygon, path');
    if (!shape) return;

    if (!shape.hasAttribute('data-orig-stroke')) {
      shape.setAttribute('data-orig-stroke', shape.getAttribute('stroke') ?? '');
      shape.setAttribute('data-orig-stroke-width', shape.getAttribute('stroke-width') ?? '1.5');
    }
    shape.setAttribute('stroke', HIGHLIGHT_COLOR);
    shape.setAttribute('stroke-width', '2.5');
    shape.style.filter = 'url(#ana-highlight-glow)';
  }, [activeNodeId, svg]);

  const zoomByStep = (delta: number): void => {
    const api = transformRef.current;
    if (!api) return;
    const current = api.state.scale;
    const next = Math.min(2.0, Math.max(0.3, Math.round((current + delta) * 10) / 10));
    api.centerView(next, 150);
  };

  /** Fit the whole diagram inside the panel (with margin) and center it. */
  const fitView = (animationTime = 200): void => {
    const api = transformRef.current;
    const container = svgContainerRef.current;
    if (!api || !container) return;
    const svgEl = container.querySelector('svg');
    const wrapperEl = container.closest('.react-transform-wrapper');
    if (!svgEl || !wrapperEl) return;

    const scale = api.state.scale || 1;
    const svgRect = svgEl.getBoundingClientRect();
    const wrapRect = wrapperEl.getBoundingClientRect();
    if (svgRect.width === 0 || svgRect.height === 0) return;

    const naturalW = svgRect.width / scale;
    const naturalH = svgRect.height / scale;
    // Fill most of the panel, and allow zooming IN so a small, simple map is
    // shown large and legible. Clamp matches the wrapper's minScale/maxScale so
    // the fit never lands on a scale the user can't reach by hand.
    const fit = Math.min(wrapRect.width / naturalW, wrapRect.height / naturalH) * 0.92;
    const clamped = Math.max(0.3, Math.min(3, fit));
    api.centerView(clamped, animationTime);
  };

  const fitToPanel = (): void => fitView(250);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  const fadeClass = `transition-opacity ${
    visible ? 'opacity-100 duration-200' : 'opacity-0 duration-150'
  }`;

  const activeLabel = activeNodeId
    ? nodeIndexRef.current.find((e) => e.id === activeNodeId)?.label ?? activeNodeId
    : null;

  // A focus or detail view is "scoped" — show a breadcrumb back to the full map.
  const isScoped = view !== 'overview' && Boolean(focusSubject);

  return (
    <div className="flex h-full flex-col bg-surface-raised">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-surface-border bg-surface-overlay px-4 py-2">
        <div className="flex items-center gap-2.5">
          {isScoped ? (
            <nav aria-label="Diagram view" className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onBackToOverview?.()}
                className="rounded text-sm text-edge-label outline-none transition-colors duration-150 hover:text-node-file-text focus-visible:text-node-file-text"
              >
                Overview
              </button>
              <span aria-hidden="true" className="text-surface-border">
                ›
              </span>
              <h2 tabIndex={-1} className="text-sm font-medium text-node-file-text outline-none">
                {view === 'detail' ? `${focusSubject} — in depth` : focusSubject}
              </h2>
            </nav>
          ) : (
            <h2 tabIndex={-1} className="text-sm font-medium text-node-file-text outline-none">
              {diagramTypeLabel(code)}
            </h2>
          )}
          {activeLabel && svg && (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-primary" />
              <span className="text-xs text-edge-label">{activeLabel}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomByStep(0.1)}
            className="flex size-8 items-center justify-center rounded-lg bg-surface-overlay text-edge-label transition-colors duration-150 hover:bg-surface-border hover:text-node-file-text"
          >
            <ZoomInIcon />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomByStep(-0.1)}
            className="flex size-8 items-center justify-center rounded-lg bg-surface-overlay text-edge-label transition-colors duration-150 hover:bg-surface-border hover:text-node-file-text"
          >
            <ZoomOutIcon />
          </button>
          <button
            type="button"
            aria-label="Fit diagram to panel"
            onClick={fitToPanel}
            className="flex size-8 items-center justify-center rounded-lg bg-surface-overlay text-edge-label transition-colors duration-150 hover:bg-surface-border hover:text-node-file-text"
          >
            <Maximize2Icon />
          </button>
          <button
            type="button"
            aria-label="Copy diagram source"
            onClick={handleCopy}
            className="flex size-8 items-center justify-center rounded-lg bg-surface-overlay text-edge-label transition-colors duration-150 hover:bg-surface-border hover:text-node-file-text"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          {diagramHistory.length > 1 && (
            <select
              aria-label="Switch diagram"
              value={activeHistoryId ?? ''}
              onChange={(e) => selectHistoryDiagram(e.target.value)}
              className="ml-1 max-w-[140px] truncate rounded-lg border border-surface-border bg-surface-overlay px-2 py-1 text-xs text-edge-label outline-none transition-colors duration-150 hover:border-node-file-text hover:text-node-file-text focus-visible:border-accent-primary"
            >
              {diagramHistory.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Diagram canvas — dotted graph-paper backdrop */}
      <div className="ana-dot-grid relative flex-1 overflow-hidden">
        {isLoading ? (
          <DiagramSkeleton />
        ) : hasError ? (
          <div className="flex h-full w-full items-center justify-center p-6">
            <div className="rounded-xl border border-node-entry-border bg-node-entry-bg/20 p-6 text-center">
              <p className="text-sm text-node-entry-text">
                Ana generated an invalid diagram — try asking again
              </p>
            </div>
          </div>
        ) : !trimmed ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <GitBranchIcon />
            <p className="text-sm text-edge-label">Ask Ana to explain your codebase</p>
          </div>
        ) : (
          <TransformWrapper
            ref={transformRef}
            initialScale={1}
            minScale={0.3}
            maxScale={3}
            centerOnInit
            wheel={{ step: 0.15 }}
            pinch={{ step: 5 }}
            // Double-click re-fits the whole map instead of blind-zooming —
            // the one-gesture escape hatch when you're lost in a zoom.
            doubleClick={{ disabled: true }}
          >
            {/* contentClass sizes to the SVG's intrinsic box (not 100%) so the
                diagram has a real size to be centered/fit against. */}
            <TransformComponent wrapperClass="!h-full !w-full" contentClass="!block">
              <div
                ref={svgContainerRef}
                role="img"
                aria-label="Architecture diagram"
                className={fadeClass}
                onDoubleClick={fitToPanel}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </TransformComponent>
          </TransformWrapper>
        )}
      </div>
    </div>
  );
}

function DiagramSkeleton(): JSX.Element {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-0">
      <div className="h-[44px] w-[140px] animate-pulse rounded-xl bg-surface-overlay" />
      <div className="h-8 w-px bg-surface-border" />
      <div className="flex gap-14">
        <div className="h-[44px] w-[130px] animate-pulse rounded-xl bg-surface-overlay" />
        <div className="h-[44px] w-[130px] animate-pulse rounded-xl bg-surface-overlay" />
      </div>
      <div className="h-8 w-px bg-surface-border" />
      <div className="flex gap-8">
        <div className="h-[44px] w-[110px] animate-pulse rounded-xl bg-surface-overlay opacity-70" />
        <div className="h-[44px] w-[110px] animate-pulse rounded-xl bg-surface-overlay" />
        <div className="h-[44px] w-[110px] animate-pulse rounded-xl bg-surface-overlay opacity-70" />
      </div>
    </div>
  );
}
