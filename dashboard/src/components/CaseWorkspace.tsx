import { useEffect, useMemo, useState } from 'react';
import { Download, NotebookPen, Plus, Trash2 } from 'lucide-react';

interface CaseWorkspaceProps {
  selectedAgentId?: string | null;
  selectedAgentName?: string | null;
  highlightedAgentIds?: string[];
  onSelectAgent: (agentId: string) => void;
}

interface InvestigationCase {
  title: string;
  notes: string;
  tags: string[];
  suspects: string[];
  updatedAt: string;
}

const STORAGE_KEY = 'moltwatch.investigation_case.v1';

function unique(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

export function CaseWorkspace({
  selectedAgentId,
  selectedAgentName,
  highlightedAgentIds = [],
  onSelectAgent,
}: CaseWorkspaceProps) {
  const [title, setTitle] = useState('Untitled Investigation');
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('coordination, trust-risk');
  const [suspects, setSuspects] = useState<string[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as InvestigationCase;
      setTitle(parsed.title || 'Untitled Investigation');
      setNotes(parsed.notes || '');
      setTagsInput((parsed.tags || []).join(', '));
      setSuspects(parsed.suspects || []);
    } catch {
      // ignore malformed local storage and continue with defaults
    }
  }, []);

  useEffect(() => {
    const payload: InvestigationCase = {
      title,
      notes,
      tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
      suspects,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [title, notes, tagsInput, suspects]);

  const tags = useMemo(() => tagsInput.split(',').map((t) => t.trim()).filter(Boolean), [tagsInput]);

  const addSelected = () => {
    if (!selectedAgentId) return;
    setSuspects((prev) => unique([...prev, selectedAgentId]));
  };

  const addHighlighted = () => {
    if (highlightedAgentIds.length === 0) return;
    setSuspects((prev) => unique([...prev, ...highlightedAgentIds]));
  };

  const removeSuspect = (id: string) => {
    setSuspects((prev) => prev.filter((s) => s !== id));
  };

  const clearCase = () => {
    setNotes('');
    setSuspects([]);
  };

  const exportCase = () => {
    const markdown = [
      `# ${title}`,
      '',
      `- Exported: ${new Date().toISOString()}`,
      `- Tags: ${tags.join(', ') || 'none'}`,
      '',
      '## Notes',
      notes || '_No notes_',
      '',
      '## Suspect Agents',
      ...(suspects.length ? suspects.map((s) => `- ${s}`) : ['- none']),
      '',
    ].join('\n');

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'moltwatch-case'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <NotebookPen size={14} className="text-orange-500" />
        <span className="text-sm font-semibold text-white">Case Workspace</span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Case title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-sm bg-[#0a0a0a] border border-neutral-800 rounded-lg px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500/50"
            placeholder="Untitled Investigation"
          />
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Tags</label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full text-sm bg-[#0a0a0a] border border-neutral-800 rounded-lg px-3 py-2 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-orange-500/50"
            placeholder="coordination, trust-risk, injection"
          />
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/25 text-orange-300">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full h-32 text-sm bg-[#0a0a0a] border border-neutral-800 rounded-lg px-3 py-2 text-neutral-200 placeholder-neutral-600 resize-none focus:outline-none focus:border-orange-500/50 leading-relaxed"
            placeholder="Key findings, confidence level, next steps..."
          />
        </div>
      </div>

      {/* Selected context */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800">
        <span className="text-xs text-neutral-500">Selected:</span>
        <span className="text-xs font-mono text-neutral-200 truncate">
          {selectedAgentName ?? selectedAgentId ?? <span className="text-neutral-600">none</span>}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={addSelected}
          disabled={!selectedAgentId}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-orange-500/35 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={12} />Add selected
        </button>
        <button
          onClick={addHighlighted}
          disabled={highlightedAgentIds.length === 0}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={12} />Add highlighted {highlightedAgentIds.length > 0 && `(${highlightedAgentIds.length})`}
        </button>
        <button
          onClick={exportCase}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors"
        >
          <Download size={12} />Export .md
        </button>
        <button
          onClick={clearCase}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-neutral-800 text-neutral-500 hover:text-red-400 hover:border-red-500/30 transition-colors ml-auto"
        >
          <Trash2 size={12} />Clear
        </button>
      </div>

      {/* Suspect list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-400">Suspects ({suspects.length})</span>
        </div>
        {suspects.length === 0 ? (
          <div className="text-sm text-neutral-500 rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4 text-center leading-relaxed min-w-0 break-words">
            No suspects yet. Select an agent in the graph and click "Add selected".
          </div>
        ) : (
          suspects.map((id, idx) => (
            <div key={id} className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-[#0a0a0a] px-3 py-2.5 min-w-0">
              <span className="text-xs text-neutral-600 w-5 shrink-0">{idx + 1}</span>
              <button
                onClick={() => onSelectAgent(id)}
                className="text-sm font-mono text-neutral-200 hover:text-orange-300 truncate flex-1 text-left transition-colors"
              >
                {id}
              </button>
              <button
                onClick={() => removeSuspect(id)}
                className="text-xs text-neutral-600 hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
