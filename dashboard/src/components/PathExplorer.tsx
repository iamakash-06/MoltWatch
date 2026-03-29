import { useMemo, useState } from 'react';
import { AlertTriangle, Route, RefreshCw } from 'lucide-react';
import { useInjectionPaths } from '../hooks/useAnalysis';

interface PathExplorerProps {
  selectedAgentId?: string | null;
  onSelectAgent: (agentId: string) => void;
  onHighlightPath: (agentIds: string[]) => void;
}

export function PathExplorer({ selectedAgentId, onSelectAgent, onHighlightPath }: PathExplorerProps) {
  const [scope, setScope] = useState<'all' | 'related'>('related');
  const { paths, loading, error, reload } = useInjectionPaths(24);

  const visiblePaths = useMemo(() => {
    if (scope === 'all' || !selectedAgentId) return paths;
    return paths.filter((p) => p.path_agents.includes(selectedAgentId));
  }, [paths, scope, selectedAgentId]);

  if (loading) {
    return <div className="text-xs text-neutral-500">Loading propagation paths...</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
        <div className="text-xs text-red-300 font-semibold">Could not load path explorer</div>
        <div className="text-[10px] text-red-200/80 mt-1 break-all font-mono">{error}</div>
        <button
          onClick={() => reload()}
          className="mt-2 text-[10px] px-2 py-1 rounded-md border border-red-400/30 text-red-200 hover:bg-red-500/20"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Route size={14} className="text-orange-500" />
        <span className="text-sm font-semibold text-white">Injection Path Explorer</span>
        <button
          onClick={() => reload()}
          className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
        >
          <RefreshCw size={12} />Refresh
        </button>
      </div>

      <p className="text-xs text-neutral-500 leading-relaxed">
        Shows how an injected prompt could propagate through agent replies and cross community boundaries.
      </p>

      <div className="flex items-center gap-2">
        {[
          { id: 'related', label: 'Related to selection' },
          { id: 'all', label: 'All paths' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setScope(item.id as 'all' | 'related')}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              scope === item.id
                ? 'bg-orange-500/15 border-orange-500/40 text-orange-200'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-neutral-600">{visiblePaths.length} path{visiblePaths.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {visiblePaths.length === 0 ? (
          <div className="text-sm text-neutral-500 rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4 text-center min-w-0 break-words">
            No paths found for the current scope.
          </div>
        ) : (
          visiblePaths.map((path, idx) => (
            <div key={`${path.source_agent}-${path.sink_agent}-${idx}`} className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4 space-y-3 min-w-0">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                  path.risk_level === 'HIGH'
                    ? 'bg-red-500/15 border-red-500/30 text-red-300'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                }`}>
                  {path.risk_level}
                </span>
                <span className="text-xs text-neutral-500">
                  {path.path_length} hops · {path.communities_crossed} {path.communities_crossed === 1 ? 'community' : 'communities'}
                </span>
              </div>

              <div className="flex flex-wrap gap-1 items-center">
                {path.path_agents.map((agent, i) => (
                  <span key={agent} className="flex items-center gap-1">
                    <button
                      onClick={() => onSelectAgent(agent)}
                      className="text-xs font-mono bg-neutral-900 text-neutral-300 px-2 py-0.5 rounded border border-neutral-700 hover:text-orange-300 hover:border-orange-500/40 transition-colors"
                    >
                      {agent.length > 12 ? agent.slice(0, 12) + '…' : agent}
                    </button>
                    {i < path.path_agents.length - 1 && (
                      <span className="text-neutral-600 text-xs">→</span>
                    )}
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onHighlightPath(path.path_agents)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-orange-500/35 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20 transition-colors"
                >
                  Highlight in graph
                </button>
                <button
                  onClick={() => onSelectAgent(path.source_agent)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  Investigate source
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-neutral-600 pt-1 border-t border-neutral-800">
        <AlertTriangle size={12} />
        Paths are heuristic indicators, not proof of attack.
      </div>
    </div>
  );
}
