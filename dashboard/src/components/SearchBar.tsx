import { useEffect, useState, useCallback, useRef, type RefObject } from 'react';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import type { AgentNode } from '../types';

const T = {
  card:     '#1a1a1f',
  elevated: '#222228',
  border:   'rgba(255,255,255,0.07)',
  borderMd: 'rgba(255,255,255,0.13)',
  text:     '#f2f2f5',
  muted:    '#9b9baa',
  dim:      '#6b6b7a',
  xdim:     '#46464f',
  orange:   '#f97316',
};

interface SearchBarProps {
  onSelectAgent: (agentId: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  clearSignal?: number;
}

export function SearchBar({ onSelectAgent, inputRef, clearSignal = 0 }: SearchBarProps) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<AgentNode[]>([]);
  const [open, setOpen]       = useState(false);
  const [focused, setFocused] = useState(false);
  const internalRef           = useRef<HTMLInputElement>(null);
  const resolvedRef           = inputRef ?? internalRef;

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    const res = await api.search(q, 'agents') as { agents: AgentNode[] };
    setResults(res.agents || []);
    setOpen(true);
  }, []);

  useEffect(() => {
    setQuery('');
    setResults([]);
    setOpen(false);
  }, [clearSignal]);

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2"
        style={{
          background:  T.card,
          border:      `1px solid ${focused ? 'rgba(249,115,22,0.45)' : T.border}`,
          boxShadow:   focused ? '0 0 0 3px rgba(249,115,22,0.08)' : 'none',
          transition:  'border-color 0.15s, box-shadow 0.15s',
          minWidth:    264,
        }}
      >
        <Search size={14} style={{ color: focused ? T.orange : T.dim, flexShrink: 0 }} />
        <input
          ref={resolvedRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => { setFocused(true); if (results.length > 0) setOpen(true); }}
          onBlur={() => { setFocused(false); setTimeout(() => setOpen(false), 150); }}
          placeholder="Search agent id or name…"
          className="flex-1 text-sm bg-transparent focus:outline-none min-w-0"
          style={{ color: T.text, caretColor: T.orange }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
            className="text-xs shrink-0 transition-colors"
            style={{ color: T.dim }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = T.text)}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = T.dim)}
          >
            ✕
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div
          className="absolute top-full mt-1.5 w-full rounded-xl overflow-hidden z-50 shadow-2xl"
          style={{
            background: T.card,
            border:     `1px solid ${T.border}`,
            minWidth:   264,
            maxWidth:   'min(100vw - 2rem, 320px)',
            boxShadow:  '0 20px 40px rgba(0,0,0,0.5)',
          }}
        >
          {results.slice(0, 8).map((agent, i) => (
            <button
              key={agent.id}
              onMouseDown={() => { onSelectAgent(agent.id); setQuery(agent.name); setOpen(false); }}
              className="w-full text-left px-4 py-3 transition-all"
              style={{
                background:   'transparent',
                borderBottom: i < Math.min(results.length, 8) - 1 ? `1px solid ${T.border}` : 'none',
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = T.elevated)}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            >
              <div className="text-sm font-mono" style={{ color: T.text }}>{agent.name}</div>
              <div className="text-xs mt-0.5" style={{ color: T.xdim }}>
                karma {agent.karma ?? 0} · community {agent.community_id ?? '?'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
