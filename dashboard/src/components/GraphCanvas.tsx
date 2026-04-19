import { useEffect, useRef, useState, useCallback } from 'react';
import Sigma from 'sigma';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Layers } from 'lucide-react';
import type { AgentNode, GraphEdge } from '../types';
import { communityColor, pageRankSize, trustColor, pageRankHeatColor, COMMUNITY_PALETTE } from '../lib/colors';

type ColorMode = 'community' | 'trust' | 'pagerank';

interface GraphCanvasProps {
  nodes: AgentNode[];
  edges: GraphEdge[];
  colorMode?: ColorMode;
  highlightAgents?: string[];
  onNodeClick?: (agentId: string) => void;
  emptyMessage?: string;
}

interface TooltipData {
  x: number;
  y: number;
  agent: AgentNode;
}

const T = {
  bg:       '#0a0a0c',
  card:     'rgba(10,10,12,0.94)',
  border:   'rgba(255,255,255,0.09)',
  text:     '#f2f2f5',
  muted:    '#9b9baa',
  dim:      '#6b6b7a',
  xdim:     '#46464f',
  orange:   '#f97316',
  cyan:     '#22d3ee',
};

function getNodeColor(node: AgentNode, mode: ColorMode, maxPr: number): string {
  if (mode === 'trust')    return trustColor(node.trust_score);
  if (mode === 'pagerank') return pageRankHeatColor(node.pagerank, maxPr);
  return communityColor(node.community_id);
}

export function GraphCanvas({
  nodes,
  edges,
  colorMode: externalColorMode,
  highlightAgents = [],
  onNodeClick,
  emptyMessage,
}: GraphCanvasProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const haloCanvasRef  = useRef<HTMLCanvasElement>(null);
  const sigmaRef       = useRef<Sigma | null>(null);
  const graphRef       = useRef<Graph | null>(null);

  const [colorMode, setColorMode] = useState<ColorMode>(externalColorMode ?? 'community');

  // Refs to prevent stale closures
  const hoveredNodeRef   = useRef<string | null>(null);
  const selectedNodeRef  = useRef<string | null>(null);
  const neighborsRef     = useRef<Set<string>>(new Set());
  const colorModeRef     = useRef<ColorMode>(colorMode);
  const highlightSetRef  = useRef<Set<string>>(new Set(highlightAgents));
  const maxPrRef         = useRef<number>(1);
  const topNodeIdsRef    = useRef<Set<string>>(new Set());

  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const communities = Array.from(
    new Set(nodes.map((n) => n.community_id).filter((c) => c !== undefined)),
  ) as number[];

  // Sync refs
  useEffect(() => { colorModeRef.current = colorMode; }, [colorMode]);
  useEffect(() => { highlightSetRef.current = new Set(highlightAgents); }, [highlightAgents]);
  useEffect(() => { if (externalColorMode) setColorMode(externalColorMode); }, [externalColorMode]);

  // ── Community halo renderer ───────────────────────────────────────────────
  const drawHalos = useCallback(() => {
    const canvas = haloCanvasRef.current;
    const sigma  = sigmaRef.current;
    const g      = graphRef.current;
    if (!canvas || !sigma || !g) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (colorModeRef.current !== 'community') return;

    // Group node viewport positions by community
    const communityPoints = new Map<number, { x: number; y: number }[]>();
    g.forEachNode((node, attrs) => {
      const agentData = attrs.agentData as AgentNode | undefined;
      const cid = agentData?.community_id;
      if (cid === undefined) return;
      const vp = sigma.graphToViewport({ x: attrs.x as number, y: attrs.y as number });
      if (!communityPoints.has(cid)) communityPoints.set(cid, []);
      communityPoints.get(cid)!.push(vp);
    });

    communityPoints.forEach((pts, cid) => {
      if (pts.length < 4) return;
      const color = communityColor(cid);

      // Centroid
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;

      // Max radius from centroid + padding
      let maxR = 0;
      pts.forEach((p) => {
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d > maxR) maxR = d;
      });
      maxR = Math.max(maxR + 44, 60);

      // Radial gradient fill
      const grad = ctx.createRadialGradient(cx, cy, maxR * 0.15, cx, cy, maxR);
      grad.addColorStop(0,   color + '20');
      grad.addColorStop(0.5, color + '12');
      grad.addColorStop(1,   color + '00');
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Dashed boundary ring
      ctx.beginPath();
      ctx.arc(cx, cy, maxR - 8, 0, Math.PI * 2);
      ctx.strokeStyle = color + '28';
      ctx.lineWidth   = 1;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }, []);

  // ── Graph builder ─────────────────────────────────────────────────────────
  const buildGraph = useCallback(() => {
    if (!containerRef.current || nodes.length === 0) return;
    if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; }

    const maxPr = Math.max(...nodes.map((n) => n.pagerank ?? 0), 1);
    maxPrRef.current = maxPr;

    // Top 15 nodes by pagerank get persistent labels
    topNodeIdsRef.current = new Set(
      [...nodes]
        .sort((a, b) => (b.pagerank ?? 0) - (a.pagerank ?? 0))
        .slice(0, 15)
        .map((n) => n.id),
    );

    // Pre-assign community cluster angles for organized initial layout
    const communityIds = Array.from(
      new Set(nodes.map((n) => n.community_id).filter((c) => c !== undefined)),
    ) as number[];
    const communityAngle = new Map<number, number>();
    communityIds.forEach((cid, i) => {
      communityAngle.set(cid, (i / Math.max(communityIds.length, 1)) * Math.PI * 2);
    });

    const g = new Graph({ multi: false, type: 'directed' });
    graphRef.current = g;

    nodes.forEach((node) => {
      const color = getNodeColor(node, colorModeRef.current, maxPr);
      const size  = pageRankSize(node.pagerank);

      // Initialize nodes in their community cluster — gives FA2 a huge head start
      const angle    = communityAngle.get(node.community_id ?? -1) ?? Math.random() * Math.PI * 2;
      const clusterR = 380;
      const scatter  = 50 + Math.random() * 50;
      const nodeAngle = Math.random() * Math.PI * 2;

      g.addNode(node.id, {
        label:     node.name,
        size,
        baseSize:  size,
        color,
        baseColor: color,
        x: Math.cos(angle) * clusterR + Math.cos(nodeAngle) * scatter,
        y: Math.sin(angle) * clusterR + Math.sin(nodeAngle) * scatter,
        agentData: node,
      });
    });

    const edgeSet = new Set<string>();
    edges.forEach((edge) => {
      const key = `${edge.source}-${edge.target}`;
      if (!edgeSet.has(key) && g.hasNode(edge.source) && g.hasNode(edge.target)) {
        edgeSet.add(key);
        g.addEdge(edge.source, edge.target, {
          size:  Math.min(Math.max(edge.weight * 0.25, 0.4), 1.5),
          color: 'rgba(255,255,255,0.04)',
        });
      }
    });

    // ForceAtlas2 — more iterations + adjustSizes for proper cluster separation
    if (g.order > 0) {
      forceAtlas2.assign(g, {
        iterations: 300,
        settings: {
          gravity:           0.8,
          scalingRatio:      18,
          strongGravityMode: false,
          slowDown:          8,
          barnesHutOptimize: g.order > 200,
          barnesHutTheta:    0.5,
          adjustSizes:       true,   // ← nodes repel based on size, prevents overlap
          linLogMode:        false,
        },
      });
    }

    // Size halo canvas to match container
    if (haloCanvasRef.current && containerRef.current) {
      const dpr = window.devicePixelRatio || 1;
      haloCanvasRef.current.width  = containerRef.current.offsetWidth  * dpr;
      haloCanvasRef.current.height = containerRef.current.offsetHeight * dpr;
      haloCanvasRef.current.style.width  = `${containerRef.current.offsetWidth}px`;
      haloCanvasRef.current.style.height = `${containerRef.current.offsetHeight}px`;
      const ctx = haloCanvasRef.current.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    }

    const sigma = new Sigma(g, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeColor: 'rgba(255,255,255,0.04)',
      defaultNodeColor: T.orange,
      labelFont:        'system-ui, -apple-system, sans-serif',
      labelSize:        11,
      labelWeight:      '600',
      labelColor:       { color: T.muted },
      minCameraRatio:   0.04,
      maxCameraRatio:   12,

      nodeReducer: (node, data) => {
        const hovered    = hoveredNodeRef.current;
        const selected   = selectedNodeRef.current;
        const neighbors  = neighborsRef.current;
        const highlights = highlightSetRef.current;
        const nodeData   = g.getNodeAttributes(node).agentData as AgentNode;
        const freshColor = getNodeColor(nodeData, colorModeRef.current, maxPrRef.current);
        const freshSize  = (data.baseSize as number | undefined) ?? (data.size as number);
        const showLabel  = topNodeIdsRef.current.has(node);

        if (highlights.has(node)) {
          return { ...data, color: T.orange, size: freshSize * 2.5, highlighted: true, zIndex: 10, label: data.label as string };
        }

        const focus = hovered || selected;
        if (!focus) {
          return { ...data, color: freshColor, size: freshSize, label: showLabel ? data.label as string : '' };
        }

        if (node === focus) {
          return { ...data, color: freshColor, size: freshSize * 2.2, highlighted: true, zIndex: 10, label: data.label as string };
        }
        if (neighbors.has(node)) {
          return { ...data, color: freshColor, size: freshSize * 1.4, zIndex: 5, label: data.label as string };
        }
        // Dim non-neighbors — nearly invisible on dark background
        return { ...data, color: '#1e1e24', size: freshSize * 0.4, label: '' };
      },

      edgeReducer: (edge, data) => {
        const focus = hoveredNodeRef.current || selectedNodeRef.current;
        if (!focus) return data;
        const src = g.source(edge);
        const tgt = g.target(edge);
        if (src === focus || tgt === focus) {
          return { ...data, color: 'rgba(249,115,22,0.55)', size: 2, zIndex: 5 };
        }
        return { ...data, color: 'rgba(255,255,255,0.015)', size: 0.3 };
      },
    });

    // Update halos on camera movement
    sigma.getCamera().on('updated', drawHalos);
    sigma.on('afterRender', drawHalos);

    // Hover
    sigma.on('enterNode', ({ node, event }) => {
      hoveredNodeRef.current = node;
      const ns = new Set<string>();
      g.forEachNeighbor(node, (n) => ns.add(n));
      neighborsRef.current = ns;
      const agentData = g.getNodeAttributes(node).agentData as AgentNode;
      const pointer   = event as unknown as { x: number; y: number };
      setTooltip({ x: pointer.x + 16, y: pointer.y - 10, agent: agentData });
      sigma.refresh();
    });

    sigma.on('leaveNode', () => {
      hoveredNodeRef.current = null;
      neighborsRef.current   = new Set();
      setTooltip(null);
      sigma.refresh();
    });

    sigma.on('clickNode', ({ node }) => {
      selectedNodeRef.current = selectedNodeRef.current === node ? null : node;
      onNodeClick?.(node);
      sigma.refresh();
    });

    sigma.on('clickStage', () => {
      if (selectedNodeRef.current) {
        selectedNodeRef.current = null;
        sigma.refresh();
      }
    });

    containerRef.current.addEventListener('mousemove', (e: MouseEvent) => {
      if (hoveredNodeRef.current !== null) {
        setTooltip((prev) => prev ? { ...prev, x: e.clientX + 16, y: e.clientY - 10 } : prev);
      }
    });

    sigmaRef.current = sigma;

    // Draw initial halos after a short delay (sigma needs to render first)
    setTimeout(drawHalos, 80);
  }, [nodes, edges, onNodeClick, drawHalos]);

  useEffect(() => {
    buildGraph();
    return () => { if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; } };
  }, [buildGraph]);

  useEffect(() => { if (sigmaRef.current) { sigmaRef.current.refresh(); drawHalos(); } }, [colorMode, drawHalos]);
  useEffect(() => { if (sigmaRef.current) sigmaRef.current.refresh(); }, [highlightAgents]);

  // Resize halo canvas on container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const hc = haloCanvasRef.current;
      if (!hc) return;
      const dpr = window.devicePixelRatio || 1;
      hc.width  = el.offsetWidth  * dpr;
      hc.height = el.offsetHeight * dpr;
      hc.style.width  = `${el.offsetWidth}px`;
      hc.style.height = `${el.offsetHeight}px`;
      const ctx = hc.getContext('2d');
      if (ctx) { ctx.scale(dpr, dpr); drawHalos(); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [drawHalos]);

  const zoomIn    = () => sigmaRef.current?.getCamera().animate({ ratio: (sigmaRef.current.getCamera().ratio ?? 1) / 1.5 }, { duration: 200 });
  const zoomOut   = () => sigmaRef.current?.getCamera().animate({ ratio: (sigmaRef.current.getCamera().ratio ?? 1) * 1.5 }, { duration: 200 });
  const resetView = () => sigmaRef.current?.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1, angle: 0 }, { duration: 300 });
  const fitGraph  = () => sigmaRef.current?.getCamera().animate({ x: 0.5, y: 0.5, ratio: 0.7, angle: 0 }, { duration: 400 });

  if (nodes.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: '0 24px', textAlign: 'center', background: T.bg }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="1.5" opacity="0.7">
            <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
            <path d="M12 7v4M12 11L5 17M12 11l7 6" />
          </svg>
        </div>
        <p style={{ fontSize: 13, color: T.muted }}>
          {emptyMessage ?? 'No graph data. Start the API server to load agent data.'}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: T.bg }}>

      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* Soft radial vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(10,10,12,0.45) 100%)' }}
      />

      {/* Community halo canvas — renders behind Sigma nodes */}
      <canvas
        ref={haloCanvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 1 }}
      />

      {/* Sigma WebGL canvas */}
      <div ref={containerRef} className="h-full w-full absolute inset-0" style={{ zIndex: 2 }} />

      {/* ── Top-left controls ── */}
      <div className="absolute top-4 left-4 flex flex-col gap-2" style={{ zIndex: 10 }}>

        {/* Color mode segmented control */}
        <div
          style={{
            display: 'flex', alignItems: 'center', padding: 4, gap: 2, borderRadius: 12,
            background: T.card, border: `1px solid ${T.border}`,
            backdropFilter: 'blur(12px)',
          }}
        >
          {(['community', 'trust', 'pagerank'] as ColorMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setColorMode(m)}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                transition: 'all 0.15s',
                background:   colorMode === m ? 'rgba(249,115,22,0.15)' : 'transparent',
                color:        colorMode === m ? T.orange : T.muted,
                border:       colorMode === m ? '1px solid rgba(249,115,22,0.3)' : '1px solid transparent',
              }}
            >
              {m === 'community' ? 'Communities' : m === 'trust' ? 'Trust' : 'Influence'}
            </button>
          ))}
        </div>

        {/* Zoom controls */}
        <div
          style={{
            display: 'flex', borderRadius: 10, overflow: 'hidden',
            background: T.card, border: `1px solid ${T.border}`,
            backdropFilter: 'blur(12px)',
          }}
        >
          {[
            { icon: ZoomIn,    action: zoomIn,    title: 'Zoom in'   },
            { icon: ZoomOut,   action: zoomOut,   title: 'Zoom out'  },
            { icon: Maximize2, action: fitGraph,  title: 'Fit graph' },
            { icon: RotateCcw, action: resetView, title: 'Reset'     },
          ].map(({ icon: Icon, action, title }, i, arr) => (
            <button
              key={title}
              onClick={action}
              title={title}
              style={{
                padding: '8px 10px', color: T.muted, transition: 'color 0.12s',
                borderRight: i < arr.length - 1 ? `1px solid ${T.border}` : 'none',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = T.text; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = T.muted; }}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Legend (bottom-left) ── */}
      <div
        style={{
          position: 'absolute', bottom: 16, left: 16, borderRadius: 12, padding: '14px 16px',
          background: T.card, border: `1px solid ${T.border}`,
          backdropFilter: 'blur(12px)', zIndex: 10,
          maxWidth: 'min(calc(100% - 2rem), 22rem)',
          maxHeight: '38vh', overflowY: 'auto',
        }}
      >
        {colorMode === 'community' && communities.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.orange, marginBottom: 10 }}>
              <Layers size={10} /> Communities
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
              {communities.slice(0, 8).map((cid) => {
                const count = nodes.filter((n) => n.community_id === cid).length;
                return (
                  <div key={cid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: COMMUNITY_PALETTE[cid % COMMUNITY_PALETTE.length], flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ color: T.muted }}>#{cid} <span style={{ color: T.text }}>({count})</span></span>
                  </div>
                );
              })}
              {communities.length > 8 && (
                <span style={{ fontSize: 11, color: T.xdim }}>+{communities.length - 8} more</span>
              )}
            </div>
          </>
        )}

        {colorMode === 'trust' && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.orange, marginBottom: 10 }}>
              Trust Level
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                { color: '#22c55e', label: 'High trust (≥ 70)' },
                { color: '#f59e0b', label: 'Medium (40–69)' },
                { color: '#ef4444', label: 'Low trust (< 40)' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: item.color, flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ color: T.muted }}>{item.label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {colorMode === 'pagerank' && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.orange, marginBottom: 10 }}>
              Influence (PageRank)
            </div>
            <div style={{ height: 6, width: 140, borderRadius: 99, background: 'linear-gradient(to right, #3b82f6, #22d3ee, #ef4444)', marginBottom: 6 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.xdim, width: 140 }}>
              <span>Low</span><span>High</span>
            </div>
          </>
        )}

        {/* Node size key */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
          {[{ sz: 5, label: 'Low' }, { sz: 8, label: 'Mid' }, { sz: 13, label: 'High' }].map(({ sz, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
              <span style={{ width: sz, height: sz, borderRadius: '50%', background: T.xdim, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ color: T.xdim }}>{label}</span>
            </div>
          ))}
          <span style={{ fontSize: 10, color: T.xdim }}>= Influence</span>
        </div>

        {highlightAgents.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 8, fontSize: 11, borderTop: `1px solid ${T.border}`, color: T.orange }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: T.orange, display: 'inline-block', flexShrink: 0 }} />
            {highlightAgents.length} agent{highlightAgents.length > 1 ? 's' : ''} highlighted
          </div>
        )}
      </div>

      {/* ── Stats badge (bottom-right) ── */}
      <div
        style={{
          position: 'absolute', bottom: 16, right: 16, zIndex: 10,
          padding: '6px 12px', borderRadius: 10, fontSize: 11, fontFamily: 'monospace',
          background: T.card, border: `1px solid ${T.border}`,
          backdropFilter: 'blur(12px)', color: T.xdim,
        }}
      >
        <span style={{ color: T.orange }}>{nodes.length.toLocaleString()}</span> nodes
        {' · '}
        <span style={{ color: T.muted }}>{edges.length.toLocaleString()}</span> edges
      </div>

      {/* ── Hover tooltip ── */}
      {tooltip && (
        <div
          style={{
            position: 'fixed', pointerEvents: 'none', zIndex: 50,
            left: tooltip.x, top: tooltip.y,
            minWidth: 200, maxWidth: 'min(90vw, 260px)',
            borderRadius: 12, padding: '14px 16px',
            background: 'rgba(10,10,12,0.97)',
            border: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(249,115,22,0.05)',
          }}
        >
          <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, marginBottom: 10, color: T.orange }}>
            {tooltip.agent.name}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tooltip.agent.trust_score !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, width: 60, flexShrink: 0, color: T.muted }}>Trust</span>
                <div style={{ flex: 1, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.08)', maxWidth: 80, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%', borderRadius: 99,
                      width: `${tooltip.agent.trust_score}%`,
                      background: tooltip.agent.trust_score >= 70 ? '#22c55e' : tooltip.agent.trust_score >= 40 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: T.text }}>
                  {Math.round(tooltip.agent.trust_score)}
                </span>
              </div>
            )}
            {[
              { label: 'Community', value: tooltip.agent.community_id !== undefined ? `#${tooltip.agent.community_id}` : '?' },
              { label: 'PageRank',  value: tooltip.agent.pagerank?.toFixed(4) },
              { label: 'Degree',    value: tooltip.agent.in_degree !== undefined ? `↓${tooltip.agent.in_degree} ↑${tooltip.agent.out_degree ?? 0}` : undefined },
            ]
              .filter((r) => r.value !== undefined)
              .map((row) => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, width: 60, flexShrink: 0, color: T.muted }}>{row.label}</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: T.text }}>{row.value}</span>
                </div>
              ))}
          </div>
          <div style={{ marginTop: 10, paddingTop: 8, fontSize: 10, borderTop: `1px solid rgba(255,255,255,0.07)`, color: T.xdim }}>
            Click to open full profile →
          </div>
        </div>
      )}
    </div>
  );
}
