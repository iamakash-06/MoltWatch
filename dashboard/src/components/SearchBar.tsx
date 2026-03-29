import { useEffect, useState, useCallback, useRef, type RefObject } from 'react';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import type { AgentNode } from '../types';

const T = {
  card:     '#0e1625',
  elevated: '#132030',
  border:   '#1c2e44',
  text:     '#dde4f0',
  muted:    '#8090a8',
  dim:      '#3d5068',
  cyan:     '#22d3ee',
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
          border:      `1px solid ${focused ? 'rgba(34,211,238,0.45)' : T.border}`,
          boxShadow:   focused ? '0 0 0 3px rgba(34,211,238,0.08)' : 'none',
          transition:  'border-color 0.15s, box-shadow 0.15s',
          minWidth:    264,
        }}
      >
        <Search size={14} style={{ color: focused ? T.cyan : T.dim, flexShrink: 0 }} />
        <input
          ref={resolvedRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => { setFocused(true); if (results.length > 0) setOpen(true); }}
          onBlur={() => { setFocused(false); setTimeout(() => setOpen(false), 150); }}
          placeholder="Search agent id or name…"
          className="flex-1 text-sm bg-transparent focus:outline-none min-w-0"
          style={{ color: T.text, caretColor: T.cyan }}
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
              <div className="text-sm font-mono text-white">{agent.name}</div>
              <div className="text-xs mt-0.5" style={{ color: T.dim }}>
                karma {agent.karma ?? 0} · community {agent.community_id ?? '?'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
