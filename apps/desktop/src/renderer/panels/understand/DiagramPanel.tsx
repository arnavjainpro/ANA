import { useEffect, useRef, useState, type ReactNode } from 'react';
import mermaid from 'mermaid';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';

// --- Mermaid initialization (Part 2) -------------------------------------
// Runs once when this module is first imported — before any diagram renders.
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    background: '#131316',
    primaryColor: '#1E2A3A',
    primaryBorderColor: '#3B6FCC',
    primaryTextColor: '#93C5FD',
    secondaryColor: '#1E2D27',
    secondaryBorderColor: '#2D8B5A',
    secondaryTextColor: '#6EE7B7',
    tertiaryColor: '#2D1E3A',
    tertiaryBorderColor: '#7C3AED',
    tertiaryTextColor: '#C4B5FD',
    edgeLabelBackground: '#1A1A1F',
    clusterBkg: '#131316',
    clusterBorder: '#2A2A32',
    lineColor: '#3A3A45',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '13px',
    nodeBorder: '1px',
    nodeTextColor: '#E2E8F0',
  },
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
    padding: 24,
    nodeSpacing: 60,
    rankSpacing: 80,
    useMaxWidth: false,
  },
  securityLevel: 'loose',
});

// These colours are applied to raw SVG attributes during post-processing, where
// Tailwind utility classes cannot reach. They intentionally mirror the design
// tokens in tailwind.config.cjs (surface.raised / surface.border / edge.label).
const SVG_BACKGROUND = '#131316'; // surface.raised
const SVG_CLUSTER_BORDER = '#2A2A32'; // surface.border
const SVG_EDGE_LABEL = '#6B7280'; // edge.label

let renderSeq = 0;

/** Whether the user has asked the OS to minimise non-essential motion. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface DiagramPanelProps {
  mermaid: string;
  isLoading: boolean;
}

// --- lucide-style inline icons -------------------------------------------
// lucide-react is not a dependency; these replicate the needed lucide glyphs
// (24×24, stroke-based) so the toolbar matches the design without adding a package.
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

/** Detect the diagram type from the leading Mermaid directive. */
function diagramTypeLabel(code: string): string {
  const head = code.trimStart();
  if (head.startsWith('flowchart LR') || head.startsWith('graph LR')) return 'Data Flow';
  if (head.startsWith('graph TD')) return 'Architecture';
  return 'File Structure';
}

/**
 * Post-process Mermaid's raw SVG into the Ana design language: rounded nodes
 * with a colour-matched glow, softened edges, styled edge labels, and themed
 * subgraph clusters. Returns the serialized SVG string.
 */
function postProcessSvg(svgString: string): string {
  const svgNs = 'http://www.w3.org/2000/svg';
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return svgString;

  // 2. Make the SVG fill its container.
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  // 3. Drop the opaque background rect Mermaid injects, so the panel shows through.
  const firstRect = svg.querySelector('rect');
  if (firstRect) {
    const fill = (firstRect.getAttribute('fill') ?? '').toLowerCase();
    if (fill === SVG_BACKGROUND.toLowerCase() || fill === '#ffffff' || fill === 'white') {
      firstRect.remove();
    }
  }

  // 4. Inject a drop-shadow glow filter into <defs> and apply it to every node.
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS(svgNs, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  const filterId = 'ana-node-glow';
  if (!doc.getElementById(filterId)) {
    const filter = doc.createElementNS(svgNs, 'filter');
    filter.setAttribute('id', filterId);
    filter.setAttribute('x', '-50%');
    filter.setAttribute('y', '-50%');
    filter.setAttribute('width', '200%');
    filter.setAttribute('height', '200%');
    const shadow = doc.createElementNS(svgNs, 'feDropShadow');
    shadow.setAttribute('dx', '0');
    shadow.setAttribute('dy', '0');
    shadow.setAttribute('stdDeviation', '4'); // ≈ drop-shadow blur 8px
    shadow.setAttribute('flood-color', 'currentColor');
    shadow.setAttribute('flood-opacity', '0.2');
    filter.appendChild(shadow);
    defs.appendChild(filter);
  }

  svg.querySelectorAll('.node rect, .node polygon').forEach((el) => {
    el.setAttribute('rx', '8');
    el.setAttribute('ry', '8');
    // currentColor on the glow resolves to the node's own stroke colour.
    const stroke = el.getAttribute('stroke');
    if (stroke) (el as SVGElement).style.color = stroke;
    (el as SVGElement).style.filter = `url(#${filterId})`;
  });

  // 5. Soften edges.
  svg.querySelectorAll('.edgePath path').forEach((el) => {
    el.setAttribute('stroke-width', '1.5');
    el.setAttribute('stroke-opacity', '0.6');
  });

  // 6. Style edge labels (works for both SVG <text> and htmlLabels markup).
  svg.querySelectorAll('.edgeLabel').forEach((el) => {
    const node = el as SVGElement & HTMLElement;
    node.style.fontSize = '11px';
    node.style.fill = SVG_EDGE_LABEL;
    node.style.color = SVG_EDGE_LABEL;
  });

  // Part 4 — subgraph (cluster) styling.
  svg.querySelectorAll('.cluster rect').forEach((el) => {
    el.setAttribute('fill', SVG_BACKGROUND);
    el.setAttribute('stroke', SVG_CLUSTER_BORDER);
    el.setAttribute('stroke-width', '1');
    el.setAttribute('rx', '12');
    el.setAttribute('ry', '12');
  });
  svg.querySelectorAll('.cluster .label, .cluster text').forEach((el) => {
    const node = el as SVGElement & HTMLElement;
    node.style.fill = SVG_EDGE_LABEL;
    node.style.color = SVG_EDGE_LABEL;
    node.style.fontSize = '11px';
    node.style.fontWeight = '500';
    node.style.letterSpacing = '0.05em';
    node.style.textTransform = 'uppercase';
  });

  return new XMLSerializer().serializeToString(svg);
}

/** Renders the Understand-mode Mermaid diagram with pan/zoom and design polish. */
export function DiagramPanel({ mermaid: code, isLoading }: DiagramPanelProps): JSX.Element {
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const prevCode = useRef<string | null>(null);
  const [svg, setSvg] = useState('');
  const [hasError, setHasError] = useState(false);
  const [visible, setVisible] = useState(true);
  const [copied, setCopied] = useState(false);

  const trimmed = code.trim();

  // Render + post-process the diagram whenever the Mermaid string changes,
  // cross-fading the canvas (unless the user prefers reduced motion).
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
      } catch (err) {
        if (cancelled) return;
        // Log the offending source so an invalid diagram is debuggable.
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
      return () => {
        cancelled = true;
      };
    }

    // Fade out (150ms), swap content, fade back in (200ms).
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

  // Re-center the freshly rendered diagram once it lands in the DOM.
  useEffect(() => {
    if (!svg) return undefined;
    const id = requestAnimationFrame(() => {
      transformRef.current?.centerView(undefined, 0);
    });
    return () => cancelAnimationFrame(id);
  }, [svg]);

  const zoomByStep = (delta: number): void => {
    const api = transformRef.current;
    if (!api) return;
    const current = api.state.scale;
    const next = Math.min(2.0, Math.max(0.5, Math.round((current + delta) * 10) / 10));
    api.centerView(next, 150);
  };

  const fitToPanel = (): void => {
    // Reset to 1:1 and re-center. `resetTransform` alone snaps the content to
    // the top-left corner (no re-center), which looked broken; `centerView`
    // restores scale 1 and centers the diagram in the panel.
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
      {/* Frosted-glass toolbar */}
      <div className="flex items-center justify-between border-b border-surface-border bg-surface-overlay/80 px-4 py-2 backdrop-blur-md">
        <h2 tabIndex={-1} className="text-sm font-medium text-node-file-text outline-none">
          {diagramTypeLabel(code)}
        </h2>
        <div className="flex items-center gap-1.5">
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

/** Skeleton that echoes a diagram's shape (nodes + connectors) while loading. */
function DiagramSkeleton(): JSX.Element {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      {/* Row 1 — single node */}
      <div className="h-[40px] w-[120px] animate-pulse rounded-lg bg-surface-overlay" />
      <div className="h-6 w-px bg-surface-border" />
      {/* Row 2 — two nodes */}
      <div className="flex gap-12">
        <div className="h-[40px] w-[120px] animate-pulse rounded-lg bg-surface-overlay" />
        <div className="h-[40px] w-[120px] animate-pulse rounded-lg bg-surface-overlay" />
      </div>
      <div className="h-6 w-px bg-surface-border" />
      {/* Row 3 — three nodes */}
      <div className="flex gap-8">
        <div className="h-[40px] w-[120px] animate-pulse rounded-lg bg-surface-overlay" />
        <div className="h-[40px] w-[120px] animate-pulse rounded-lg bg-surface-overlay" />
        <div className="h-[40px] w-[120px] animate-pulse rounded-lg bg-surface-overlay" />
      </div>
    </div>
  );
}
