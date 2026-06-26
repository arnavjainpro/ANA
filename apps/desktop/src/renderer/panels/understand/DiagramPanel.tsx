import { useEffect, useRef, useState, type ReactNode } from 'react';
import mermaid from 'mermaid';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';

// --- Mermaid initialization --------------------------------------------------
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    background: '#131316',
    primaryColor: '#1A2540',
    primaryBorderColor: '#3B6FCC',
    primaryTextColor: '#93C5FD',
    secondaryColor: '#192B22',
    secondaryBorderColor: '#2D8B5A',
    secondaryTextColor: '#6EE7B7',
    tertiaryColor: '#26193A',
    tertiaryBorderColor: '#7C3AED',
    tertiaryTextColor: '#C4B5FD',
    edgeLabelBackground: '#1A1A1F',
    clusterBkg: '#111114',
    clusterBorder: '#2A2A38',
    lineColor: '#3A3A50',
    fontFamily: 'Inter Variable, Inter, system-ui, sans-serif',
    fontSize: '13px',
    nodeBorder: '1.5px',
    nodeTextColor: '#E2E8F0',
  },
  flowchart: {
    htmlLabels: true,
    curve: 'monotoneX',
    padding: 28,
    nodeSpacing: 64,
    rankSpacing: 88,
    useMaxWidth: false,
  },
  securityLevel: 'loose',
});

// Design tokens mirrored from tailwind.config.cjs
const SVG_BACKGROUND = '#131316';
const SVG_CLUSTER_BG = '#111114';
const SVG_CLUSTER_BORDER = '#2A2A38';
const SVG_EDGE_LABEL = '#6B7280';
const SVG_EDGE_COLOR = '#3A3A50';
const HIGHLIGHT_COLOR = '#3B82F6';
const HIGHLIGHT_GLOW_COLOR = 'rgba(59,130,246,0.4)';

// Node type → gradient stops (top, bottom) derived from the mermaid theme palette
const NODE_GRADIENTS: Array<{ id: string; top: string; bottom: string }> = [
  { id: 'grad-primary', top: '#223260', bottom: '#1A2540' },
  { id: 'grad-secondary', top: '#1F3A2D', bottom: '#192B22' },
  { id: 'grad-tertiary', top: '#31234A', bottom: '#26193A' },
  { id: 'grad-external', top: '#3B2E18', bottom: '#2D2414' },
];

let renderSeq = 0;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface DiagramPanelProps {
  mermaid: string;
  isLoading: boolean;
  highlightedNodes?: string[];
}

// --- Icons -------------------------------------------------------------------
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
  if (head.startsWith('flowchart LR') || head.startsWith('graph LR')) return 'Data Flow';
  if (head.startsWith('graph TD')) return 'Architecture';
  return 'File Structure';
}

/**
 * Inject SVG defs (gradients + filters) for enterprise-grade node styling and
 * the highlight glow used when Ana discusses a specific node.
 */
function buildDefs(doc: Document, svgNs: string, defs: Element): void {
  // Gradient fills for node backgrounds
  for (const { id, top, bottom } of NODE_GRADIENTS) {
    if (doc.getElementById(id)) continue;
    const grad = doc.createElementNS(svgNs, 'linearGradient');
    grad.setAttribute('id', id);
    grad.setAttribute('x1', '0%');
    grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '0%');
    grad.setAttribute('y2', '100%');
    const s1 = doc.createElementNS(svgNs, 'stop');
    s1.setAttribute('offset', '0%');
    s1.setAttribute('stop-color', top);
    const s2 = doc.createElementNS(svgNs, 'stop');
    s2.setAttribute('offset', '100%');
    s2.setAttribute('stop-color', bottom);
    grad.appendChild(s1);
    grad.appendChild(s2);
    defs.appendChild(grad);
  }

  // Ambient node glow (dim, applied to all nodes)
  if (!doc.getElementById('ana-node-glow')) {
    const f = doc.createElementNS(svgNs, 'filter');
    f.setAttribute('id', 'ana-node-glow');
    f.setAttribute('x', '-30%');
    f.setAttribute('y', '-30%');
    f.setAttribute('width', '160%');
    f.setAttribute('height', '160%');
    const shadow = doc.createElementNS(svgNs, 'feDropShadow');
    shadow.setAttribute('dx', '0');
    shadow.setAttribute('dy', '2');
    shadow.setAttribute('stdDeviation', '3');
    shadow.setAttribute('flood-color', 'currentColor');
    shadow.setAttribute('flood-opacity', '0.18');
    f.appendChild(shadow);
    defs.appendChild(f);
  }

  // Active-highlight glow (bright blue, applied to the focused node)
  if (!doc.getElementById('ana-highlight-glow')) {
    const f = doc.createElementNS(svgNs, 'filter');
    f.setAttribute('id', 'ana-highlight-glow');
    f.setAttribute('x', '-40%');
    f.setAttribute('y', '-40%');
    f.setAttribute('width', '180%');
    f.setAttribute('height', '180%');
    const blur = doc.createElementNS(svgNs, 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', '5');
    blur.setAttribute('result', 'blur');
    const flood = doc.createElementNS(svgNs, 'feFlood');
    flood.setAttribute('flood-color', HIGHLIGHT_GLOW_COLOR);
    flood.setAttribute('result', 'color');
    const composite = doc.createElementNS(svgNs, 'feComposite');
    composite.setAttribute('in', 'color');
    composite.setAttribute('in2', 'blur');
    composite.setAttribute('operator', 'in');
    composite.setAttribute('result', 'glow');
    const merge = doc.createElementNS(svgNs, 'feMerge');
    const mg1 = doc.createElementNS(svgNs, 'feMergeNode');
    mg1.setAttribute('in', 'glow');
    const mg2 = doc.createElementNS(svgNs, 'feMergeNode');
    mg2.setAttribute('in', 'SourceGraphic');
    merge.appendChild(mg1);
    merge.appendChild(mg2);
    f.appendChild(blur);
    f.appendChild(flood);
    f.appendChild(composite);
    f.appendChild(merge);
    defs.appendChild(f);
  }
}

/**
 * Post-process Mermaid's raw SVG into enterprise-grade Ana design language:
 * gradient node fills, glow filters, rounded corners, styled edges, subgraph
 * badges, and data-node-id stamps for the highlight system.
 */
function postProcessSvg(svgString: string): string {
  const svgNs = 'http://www.w3.org/2000/svg';
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return svgString;

  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  // Remove Mermaid's opaque background rect
  const firstRect = svg.querySelector('rect');
  if (firstRect) {
    const fill = (firstRect.getAttribute('fill') ?? '').toLowerCase();
    if (fill === SVG_BACKGROUND.toLowerCase() || fill === '#ffffff' || fill === 'white') {
      firstRect.remove();
    }
  }

  // Inject defs (gradients + filters)
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS(svgNs, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  buildDefs(doc, svgNs, defs);

  // Style nodes — rounded corners, gradient fill, glow, data-node-id stamp
  svg.querySelectorAll<SVGGElement>('.node').forEach((nodeEl) => {
    // Extract the mermaid node ID from the element id (flowchart-{nodeId}-{seq})
    const rawId = nodeEl.getAttribute('id') ?? '';
    const match = rawId.match(/^(?:flowchart-)?(.+?)(?:-\d+)?$/);
    const nodeId = match?.[1] ?? rawId;
    if (nodeId) nodeEl.setAttribute('data-node-id', nodeId);

    const shape = nodeEl.querySelector<SVGElement>('rect, polygon');
    if (!shape) return;

    shape.setAttribute('rx', '10');
    shape.setAttribute('ry', '10');

    // Apply gradient fill based on the node's current fill color
    const fill = (shape.getAttribute('fill') ?? '').toLowerCase();
    let gradId = 'grad-primary';
    if (fill.includes('2d') && fill.includes('27')) gradId = 'grad-secondary';
    else if (fill.includes('2d') && fill.includes('3a')) gradId = 'grad-tertiary';
    else if (fill.includes('2d') && fill.includes('18')) gradId = 'grad-external';
    shape.setAttribute('fill', `url(#${gradId})`);

    // Thicker, colored stroke
    const stroke = shape.getAttribute('stroke');
    if (stroke) {
      (shape as SVGElement).style.color = stroke;
      shape.setAttribute('stroke-width', '1.5');
    }

    (shape as SVGElement).style.filter = 'url(#ana-node-glow)';
  });

  // Enterprise edge styling — smooth, slightly opaque arrows
  svg.querySelectorAll<SVGElement>('.edgePath path').forEach((el) => {
    el.setAttribute('stroke', SVG_EDGE_COLOR);
    el.setAttribute('stroke-width', '1.5');
    el.setAttribute('stroke-opacity', '0.7');
  });

  // Arrowhead markers — match edge color
  svg.querySelectorAll<SVGElement>('marker path, marker polygon').forEach((el) => {
    el.setAttribute('fill', SVG_EDGE_COLOR);
    el.setAttribute('stroke', SVG_EDGE_COLOR);
  });

  // Edge labels
  svg.querySelectorAll<SVGElement & HTMLElement>('.edgeLabel').forEach((el) => {
    el.style.fontSize = '11px';
    el.style.fill = SVG_EDGE_LABEL;
    el.style.color = SVG_EDGE_LABEL;
    el.style.letterSpacing = '0.01em';
  });

  // Subgraph (cluster) styling — darker backdrop, uppercase badge label
  svg.querySelectorAll<SVGElement>('.cluster rect').forEach((el) => {
    el.setAttribute('fill', SVG_CLUSTER_BG);
    el.setAttribute('stroke', SVG_CLUSTER_BORDER);
    el.setAttribute('stroke-width', '1');
    el.setAttribute('stroke-dasharray', '4,3');
    el.setAttribute('rx', '14');
    el.setAttribute('ry', '14');
  });
  svg.querySelectorAll<SVGElement & HTMLElement>('.cluster .label, .cluster text').forEach((el) => {
    el.style.fill = '#4B5563';
    el.style.color = '#4B5563';
    el.style.fontSize = '10px';
    el.style.fontWeight = '600';
    el.style.letterSpacing = '0.08em';
    el.style.textTransform = 'uppercase';
  });

  // Node label text — sharper rendering
  svg.querySelectorAll<SVGElement & HTMLElement>('.node .label, .node text, .nodeLabel').forEach((el) => {
    el.style.fontFamily = 'Inter Variable, Inter, system-ui, sans-serif';
    el.style.fontWeight = '500';
    el.style.letterSpacing = '-0.01em';
  });

  return new XMLSerializer().serializeToString(svg);
}

/** Renders the Understand-mode Mermaid diagram with pan/zoom, enterprise styling, and node highlighting. */
export function DiagramPanel({ mermaid: code, isLoading, highlightedNodes }: DiagramPanelProps): JSX.Element {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const prevCode = useRef<string | null>(null);
  const [svg, setSvg] = useState('');
  const [hasError, setHasError] = useState(false);
  const [visible, setVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeNodeIdx, setActiveNodeIdx] = useState(0);

  const trimmed = code.trim();

  // Render + post-process the diagram whenever the Mermaid string changes
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
        setActiveNodeIdx(0);
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

  // Re-center whenever a new diagram lands
  useEffect(() => {
    if (!svg) return undefined;
    const id = requestAnimationFrame(() => {
      transformRef.current?.centerView(undefined, 0);
    });
    return () => cancelAnimationFrame(id);
  }, [svg]);

  // Cycle through highlighted nodes every 2.5 s
  useEffect(() => {
    if (!highlightedNodes?.length) return undefined;
    setActiveNodeIdx(0);
    const interval = setInterval(() => {
      setActiveNodeIdx((i) => (i + 1) % (highlightedNodes?.length ?? 1));
    }, 2500);
    return () => clearInterval(interval);
  }, [highlightedNodes]);

  // Apply/remove highlight ring directly on the SVG DOM whenever the active node changes
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;

    // Clear previous highlight
    container.querySelectorAll<SVGElement>('[data-node-id]').forEach((nodeEl) => {
      const shape = nodeEl.querySelector<SVGElement>('rect, polygon');
      if (!shape) return;
      const orig = shape.getAttribute('data-orig-stroke');
      const origWidth = shape.getAttribute('data-orig-stroke-width');
      if (orig !== null) shape.setAttribute('stroke', orig);
      if (origWidth !== null) shape.setAttribute('stroke-width', origWidth);
      shape.style.filter = 'url(#ana-node-glow)';
    });

    if (!highlightedNodes?.length) return;
    const nodeId = highlightedNodes[activeNodeIdx % highlightedNodes.length];
    if (!nodeId) return;

    const nodeEl = container.querySelector<SVGElement>(`[data-node-id="${CSS.escape(nodeId)}"]`);
    if (!nodeEl) return;

    const shape = nodeEl.querySelector<SVGElement>('rect, polygon');
    if (!shape) return;

    // Persist originals so we can restore them
    if (!shape.hasAttribute('data-orig-stroke')) {
      shape.setAttribute('data-orig-stroke', shape.getAttribute('stroke') ?? '');
      shape.setAttribute('data-orig-stroke-width', shape.getAttribute('stroke-width') ?? '1.5');
    }

    shape.setAttribute('stroke', HIGHLIGHT_COLOR);
    shape.setAttribute('stroke-width', '2.5');
    shape.style.filter = 'url(#ana-highlight-glow)';
  }, [activeNodeIdx, highlightedNodes, svg]);

  const zoomByStep = (delta: number): void => {
    const api = transformRef.current;
    if (!api) return;
    const current = api.state.scale;
    const next = Math.min(2.0, Math.max(0.5, Math.round((current + delta) * 10) / 10));
    api.centerView(next, 150);
  };

  const fitToPanel = (): void => {
    transformRef.current?.centerView(1, 200);
  };

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  const fadeClass = `h-full w-full transition-opacity ${
    visible ? 'opacity-100 duration-200' : 'opacity-0 duration-150'
  }`;

  return (
    <div className="flex h-full flex-col bg-surface-raised shadow-panel">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-surface-border bg-surface-overlay px-4 py-2">
        <div className="flex items-center gap-2.5">
          <h2 tabIndex={-1} className="text-sm font-medium text-node-file-text outline-none">
            {diagramTypeLabel(code)}
          </h2>
          {highlightedNodes && highlightedNodes.length > 0 && svg && (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-primary" />
              <span className="text-xs text-edge-label">
                {highlightedNodes[activeNodeIdx % highlightedNodes.length]}
              </span>
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
        </div>
      </div>

      {/* Diagram canvas */}
      <div className="relative flex-1 overflow-hidden">
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
            minScale={0.5}
            maxScale={3}
            centerOnInit
            wheel={{ step: 0.08 }}
            doubleClick={{ disabled: false, step: 0.5 }}
          >
            <TransformComponent wrapperClass="!h-full !w-full" contentClass="!h-full !w-full">
              <div
                ref={svgContainerRef}
                role="img"
                aria-label="Architecture diagram"
                className={fadeClass}
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
