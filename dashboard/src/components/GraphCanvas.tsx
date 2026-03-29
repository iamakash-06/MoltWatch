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
  const containerRef    = useRef<HTMLDivElement>(null);
  const sigmaRef        = useRef<Sigma | null>(null);
  const graphRef        = useRef<Graph | null>(null);

  const [colorMode, setColorMode] = useState<ColorMode>(externalColorMode ?? 'community');

  // Refs for reducers (prevent stale closures)
  const hoveredNodeRef   = useRef<string | null>(null);
  const selectedNodeRef  = useRef<string | null>(null);
  const neighborsRef     = useRef<Set<string>>(new Set());
  const colorModeRef     = useRef<ColorMode>(colorMode);
  const highlightSetRef  = useRef<Set<string>>(new Set(highlightAgents));
  const maxPrRef         = useRef<number>(1);

  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const communities = Array.from(
    new Set(nodes.map((n) => n.community_id).filter((c) => c !== undefined)),
  ) as number[];

  // Sync refs
  useEffect(() => { colorModeRef.current = colorMode; }, [colorMode]);
  useEffect(() => { highlightSetRef.current = new Set(highlightAgents); }, [highlightAgents]);
  useEffect(() => {
    if (externalColorMode) setColorMode(externalColorMode);
  }, [externalColorMode]);

  const buildGraph = useCallback(() => {
    if (!containerRef.current || nodes.length === 0) return;
    if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; }

    const maxPr = Math.max(...nodes.map((n) => n.pagerank ?? 0), 1);
    maxPrRef.current = maxPr;

    const g = new Graph({ multi: false, type: 'directed' });
    graphRef.current = g;

    nodes.forEach((node) => {
      const color = getNodeColor(node, colorModeRef.current, maxPr);
      const size  = pageRankSize(node.pagerank);
      g.addNode(node.id, {
        label:     node.name,
        size,
        baseSize:  size,
        color,
        baseColor: color,
        x: Math.random() * 1000 - 500,
        y: Math.random() * 1000 - 500,
        agentData: node,
      });
    });

    const edgeSet = new Set<string>();
    edges.forEach((edge) => {
      const key = `${edge.source}-${edge.target}`;
      if (!edgeSet.has(key) && g.hasNode(edge.source) && g.hasNode(edge.target)) {
        edgeSet.add(key);
        g.addEdge(edge.source, edge.target, {
          size:  Math.min(Math.max(edge.weight * 0.3, 0.5), 2.5),
          color: '#162840',   // blue-dark edge base
        });
      }
    });

    // ForceAtlas2
    if (g.order > 0) {
      forceAtlas2.assign(g, {
        iterations: 150,
        settings: {
          gravity:          2,
          scalingRatio:     12,
          strongGravityMode: false,
          slowDown:         10,
          barnesHutOptimize: g.order > 300,
          barnesHutTheta:   0.5,
          adjustSizes:      false,
        },
      });
    }

    const sigma = new Sigma(g, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeColor: '#162840',
      defaultNodeColor: '#22d3ee',
      labelFont:        'DM Sans, system-ui, sans-serif',
      labelSize:        12,
      labelWeight:      '500',
      labelColor:       { color: '#aec4d8' },
      minCameraRatio:   0.05,
      maxCameraRatio:   10,

      nodeReducer: (node, data) => {
        const hovered    = hoveredNodeRef.current;
        const selected   = selectedNodeRef.current;
        const neighbors  = neighborsRef.current;
        const highlights = highlightSetRef.current;

        const nodeData   = g.getNodeAttributes(node).agentData as AgentNode;
        const freshColor = getNodeColor(nodeData, colorModeRef.current, maxPrRef.current);
        const freshSize  = (data.baseSize as number | undefined) ?? (data.size as number);

        if (highlights.has(node)) {
          return { ...data, color: '#22d3ee', size: freshSize * 2.2, highlighted: true, zIndex: 10 };
        }

        const focus = hovered || selected;
        if (!focus) {
          return { ...data, color: freshColor, size: freshSize };
        }

        if (node === focus) {
          return { ...data, color: freshColor, size: freshSize * 2.2, highlighted: true, zIndex: 10 };
        }
        if (neighbors.has(node)) {
          return { ...data, color: freshColor, size: freshSize * 1.4, zIndex: 5 };
        }
        // Dim non-neighbors — deep navy so they nearly disappear
        return { ...data, color: '#0e1827', size: freshSize * 0.5, label: '' };
      },

      edgeReducer: (edge, data) => {
        const focus = hoveredNodeRef.current || selectedNodeRef.current;
        if (!focus) return data;
        const src = g.source(edge);
        const tgt = g.target(edge);
        if (src === focus || tgt === focus) {
          return { ...data, color: '#22d3ee', size: 2.5, zIndex: 5 };
        }
        return { ...data, color: '#080f19', size: 0.3 };
      },
    });

    // Hover
    sigma.on('enterNode', ({ node, event }) => {
      hoveredNodeRef.current = node;
      const ns = new Set<string>();
      g.forEachNeighbor(node, (n) => ns.add(n));
      neighborsRef.current = ns;
      const agentData = g.getNodeAttributes(node).agentData as AgentNode;
      const pointer   = event as unknown as { x: number; y: number };
      setTooltip({ x: pointer.x + 14, y: pointer.y - 8, agent: agentData });
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
        setTooltip((prev) => prev ? { ...prev, x: e.clientX + 14, y: e.clientY - 8 } : prev);
      }
    });

    sigmaRef.current = sigma;
  }, [nodes, edges, onNodeClick]);

  useEffect(() => {
    buildGraph();
    return () => { if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; } };
  }, [buildGraph]);

  useEffect(() => { if (sigmaRef.current) sigmaRef.current.refresh(); }, [colorMode]);
  useEffect(() => { if (sigmaRef.current) sigmaRef.current.refresh(); }, [highlightAgents]);

  const zoomIn    = () => sigmaRef.current?.getCamera().animate({ ratio: (sigmaRef.current.getCamera().ratio ?? 1) / 1.5 }, { duration: 200 });
  const zoomOut   = () => sigmaRef.current?.getCamera().animate({ ratio: (sigmaRef.current.getCamera().ratio ?? 1) * 1.5 }, { duration: 200 });
  const resetView = () => sigmaRef.current?.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1, angle: 0 }, { duration: 300 });
  const fitGraph  = () => sigmaRef.current?.getCamera().animate({ x: 0.5, y: 0.5, ratio: 0.7, angle: 0 }, { duration: 400 });

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6">
            <circle cx="12" cy="12" r="10" /><path d="M8 12h8M12 8v8" />
          </svg>
        </div>
        <p className="text-sm" style={{ color: '#8090a8' }}>
          {emptyMessage ?? (
            <>
              No graph data.{' '}
              <code
                className="font-mono text-xs px-1.5 py-0.5 rounded"
                style={{ background: '#0e1625', border: '1px solid #1c2e44', color: '#22d3ee' }}
              >
                scripts/seed_neo4j.py
              </code>
            </>
          )}
        </p>
      </div>
    );
  }

  /* ──────────────────────────────────────────────── */

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: '#070b14' }}
    >
      {/* Dot grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(34,90,140,0.35) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* Radial vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 40%, rgba(13,30,60,0.55) 0%, transparent 70%)',
        }}
      />

      {/* Sigma canvas */}
      <div ref={containerRef} className="h-full w-full" />

      {/* ── Top-left controls ── */}
      <div className="absolute top-4 left-4 flex flex-col gap-2.5">

        {/* Color mode segmented control */}
        <div
          className="flex items-center p-1 gap-1 rounded-xl backdrop-blur-sm"
          style={{ background: 'rgba(11,18,33,0.92)', border: '1px solid #1c2e44' }}
        >
          {(['community', 'trust', 'pagerank'] as ColorMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setColorMode(m)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={
                colorMode === m
                  ? { background: 'rgba(34,211,238,0.15)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)' }
                  : { background: 'transparent', color: '#8090a8', border: '1px solid transparent' }
              }
            >
              {m === 'community' ? 'Communities' : m === 'trust' ? 'Trust' : 'Influence'}
            </button>
          ))}
        </div>

        {/* Zoom controls */}
        <div
          className="flex rounded-xl overflow-hidden backdrop-blur-sm"
          style={{ background: 'rgba(11,18,33,0.92)', border: '1px solid #1c2e44' }}
        >
          {[
            { icon: ZoomIn,    action: zoomIn,    title: 'Zoom in'   },
            { icon: ZoomOut,   action: zoomOut,   title: 'Zoom out'  },
            { icon: Maximize2, action: fitGraph,  title: 'Fit graph' },
            { icon: RotateCcw, action: resetView, title: 'Reset'     },
          ].map(({ icon: Icon, action, title }) => (
            <button
              key={title}
              onClick={action}
              title={title}
              className="p-2.5 transition-colors"
              style={{ color: '#8090a8', borderRight: '1px solid #1c2e44' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#dde4f0')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#8090a8')}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Legend (bottom-left) ── */}
      <div
        className="absolute bottom-4 left-4 rounded-xl p-4 backdrop-blur-sm"
        style={{
          background: 'rgba(11,18,33,0.92)',
          border: '1px solid #1c2e44',
          maxWidth: 'min(calc(100% - 2rem), 22rem)',
          maxHeight: '40vh',
          overflowY: 'auto',
        }}
      >
        {colorMode === 'community' && communities.length > 0 && (
          <>
            <div
              className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5"
              style={{ color: '#22d3ee' }}
            >
              <Layers size={11} /> Communities
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {communities.slice(0, 8).map((cid) => {
                const count = nodes.filter((n) => n.community_id === cid).length;
                return (
                  <div key={cid} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: COMMUNITY_PALETTE[cid % COMMUNITY_PALETTE.length] }}
                    />
                    <span style={{ color: '#8090a8' }}>#{cid} <span style={{ color: '#dde4f0' }}>({count})</span></span>
                  </div>
                );
              })}
              {communities.length > 8 && (
                <span className="text-xs" style={{ color: '#3d5068' }}>
                  +{communities.length - 8} more
                </span>
              )}
            </div>
          </>
        )}

        {colorMode === 'trust' && (
          <>
            <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#22d3ee' }}>
              Trust Level
            </div>
            <div className="space-y-2">
              {[
                { color: '#34d399', label: 'High trust (≥ 70)' },
                { color: '#fbbf24', label: 'Medium (40–69)' },
                { color: '#f43f5e', label: 'Low trust (< 40)' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                  <span style={{ color: '#8090a8' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {colorMode === 'pagerank' && (
          <>
            <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#22d3ee' }}>
              Influence (PageRank)
            </div>
            <div
              className="h-2 w-36 rounded-full mb-1.5"
              style={{ background: 'linear-gradient(to right, #3b82f6, #22d3ee, #f43f5e)' }}
            />
            <div className="flex justify-between text-xs" style={{ color: '#3d5068' }}>
              <span>Low</span><span>High</span>
            </div>
          </>
        )}

        {/* Node size key */}
        <div
          className="flex items-center gap-4 mt-3 pt-3"
          style={{ borderTop: '1px solid #1c2e44' }}
        >
          {[{ sz: 5, label: 'Low' }, { sz: 9, label: 'Mid' }, { sz: 14, label: 'High' }].map(({ sz, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs">
              <span
                className="rounded-full inline-block shrink-0"
                style={{ width: sz, height: sz, background: '#3d5068' }}
              />
              <span style={{ color: '#3d5068' }}>{label}</span>
            </div>
          ))}
          <span className="text-xs ml-1" style={{ color: '#3d5068' }}>= Influence</span>
        </div>

        {highlightAgents.length > 0 && (
          <div
            className="flex items-center gap-2 mt-3 pt-3 text-xs"
            style={{ borderTop: '1px solid #1c2e44', color: '#22d3ee' }}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
            {highlightAgents.length} agent{highlightAgents.length > 1 ? 's' : ''} highlighted
          </div>
        )}
      </div>

      {/* ── Stats badge (bottom-right) ── */}
      <div
        className="absolute bottom-4 right-4 px-3.5 py-2 rounded-xl text-xs font-mono backdrop-blur-sm"
        style={{
          background: 'rgba(11,18,33,0.9)',
          border: '1px solid #1c2e44',
          color: '#3d5068',
        }}
      >
        <span style={{ color: '#22d3ee' }}>{nodes.length.toLocaleString()}</span> nodes
        {' · '}
        <span style={{ color: '#8090a8' }}>{edges.length.toLocaleString()}</span> edges
      </div>

      {/* ── Hover tooltip ── */}
      {tooltip && (
        <div
          className="fixed pointer-events-none z-50 rounded-xl shadow-2xl p-4 max-w-[min(90vw,20rem)]"
          style={{
            left: tooltip.x,
            top:  tooltip.y,
            minWidth: 200,
            maxWidth: 'min(90vw, 280px)',
            background: 'rgba(11,18,33,0.97)',
            border: '1px solid #1c2e44',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,211,238,0.08)',
          }}
        >
          <div className="font-mono text-sm font-bold mb-3" style={{ color: '#22d3ee' }}>
            {tooltip.agent.name}
          </div>
          <div className="space-y-2">
            {tooltip.agent.trust_score !== undefined && (
              <div className="flex items-center gap-3">
                <span className="text-xs w-16 shrink-0" style={{ color: '#8090a8' }}>Trust</span>
                <div
                  className="flex-1 rounded-full h-1.5 overflow-hidden"
                  style={{ background: '#1c2e44', maxWidth: 80 }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${tooltip.agent.trust_score}%`,
                      background: tooltip.agent.trust_score >= 70
                        ? '#34d399'
                        : tooltip.agent.trust_score >= 40
                          ? '#fbbf24'
                          : '#f43f5e',
                    }}
                  />
                </div>
                <span className="text-xs font-mono font-bold" style={{ color: '#dde4f0' }}>
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
                <div key={row.label} className="flex items-center gap-3">
                  <span className="text-xs w-16 shrink-0" style={{ color: '#8090a8' }}>{row.label}</span>
                  <span className="text-xs font-mono" style={{ color: '#dde4f0' }}>{row.value}</span>
                </div>
              ))}
          </div>
          <div className="mt-3 pt-2.5 text-xs" style={{ borderTop: '1px solid #1c2e44', color: '#3d5068' }}>
            Click to open full profile →
          </div>
        </div>
      )}
    </div>
  );
}
