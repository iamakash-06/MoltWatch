/** Color scales for MoltWatch threat levels and graph visualization. */

export const THREAT_COLORS = {
  CRITICAL: '#f43f5e',
  HIGH:     '#f97316',
  MEDIUM:   '#fbbf24',
  LOW:      '#34d399',
  Info:     '#60a5fa',
} as const;

/** Badge classes — used inside threat cards, threat page pills, etc. */
export const SEVERITY_BG = {
  CRITICAL: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  HIGH:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
  MEDIUM:   'bg-amber-400/15 text-amber-400 border-amber-400/30',
  LOW:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
} as const;

/** Left border hex — for colored left-border on threat / alert cards. */
export const SEVERITY_BORDER = {
  CRITICAL: '#f43f5e',
  HIGH:     '#f97316',
  MEDIUM:   '#fbbf24',
  LOW:      '#34d399',
} as const;

/**
 * High-contrast community palette.
 * These vivid hues pop well on the dark navy (#070b14) background.
 */
export const COMMUNITY_PALETTE = [
  '#22d3ee', // cyan
  '#34d399', // emerald
  '#a78bfa', // violet
  '#60a5fa', // blue
  '#f87171', // coral
  '#fbbf24', // amber
  '#38bdf8', // sky
  '#fb923c', // orange
  '#4ade80', // lime
  '#e879f9', // fuchsia
  '#2dd4bf', // teal
  '#f472b6', // pink
  '#a3e635', // yellow-green
  '#818cf8', // periwinkle
  '#fdba74', // peach
  '#86efac', // light-green
  '#c4b5fd', // lavender
  '#7dd3fc', // light-blue
  '#fca5a5', // light-red
  '#6ee7b7', // mint
];

export function communityColor(community_id: number | undefined): string {
  if (community_id === undefined || community_id === null) return '#64748b';
  return COMMUNITY_PALETTE[community_id % COMMUNITY_PALETTE.length];
}

export function trustColor(trust_score: number | undefined): string {
  if (trust_score === undefined) return '#64748b';
  if (trust_score >= 70) return '#34d399';
  if (trust_score >= 40) return '#fbbf24';
  return '#f43f5e';
}

/** Sqrt-scale node sizing — top agents are visibly larger than most. */
export function pageRankSize(pagerank: number | undefined, min = 4, max = 20): number {
  if (!pagerank || pagerank <= 0) return min;
  const normalized = Math.min(Math.sqrt(pagerank / 10), 1);
  return min + normalized * (max - min);
}

/** Dim a hex color for non-focused nodes (deep navy so they nearly vanish). */
export function dimHex(_hex: string): string {
  return '#0e1827';
}

/** PageRank heatmap: low = blue, mid = cyan, high = rose. */
export function pageRankHeatColor(pagerank: number | undefined, maxPr = 8): string {
  if (!pagerank || pagerank <= 0) return '#3b82f6';
  const t = Math.min(pagerank / maxPr, 1);
  if (t < 0.5) {
    // blue → cyan
    const u = t * 2;
    const r = Math.round(59  + u * (34  - 59));
    const g = Math.round(130 + u * (211 - 130));
    const b = Math.round(246 + u * (238 - 246));
    return `rgb(${r},${g},${b})`;
  } else {
    // cyan → rose
    const u = (t - 0.5) * 2;
    const r = Math.round(34  + u * (244 - 34));
    const g = Math.round(211 + u * (63  - 211));
    const b = Math.round(238 + u * (94  - 238));
    return `rgb(${r},${g},${b})`;
  }
}
