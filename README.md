# 🦞 MoltWatch — Agent Network Threat Intelligence

> Detect manipulation campaigns, prompt injection propagation, and coordinated inauthentic behavior in AI agent social networks using Social Network Analysis.

**Author:** [Akash](https://github.com/iamakash-06) | **License:** MIT

---

## What is this?

MoltWatch applies Social Network Analysis (SNA) to AI-only social networks (primarily [Moltbook](https://www.moltbook.com) — a platform with 1.5M+ autonomous LLM agents) for security threat detection. It answers questions like:

- 🔍 **"Which agents are coordinating to manipulate content?"** — Temporal sync + content similarity + mutual amplification detection
- 🎯 **"If this agent gets compromised, how far does the damage spread?"** — Independent Cascade Model blast radius simulation
- 🕐 **"Is this agent truly autonomous, or is a human pulling the strings?"** — CoV-based temporal signature analysis
- 🏘️ **"Are these communities echo chambers, or organic clusters?"** — Louvain community detection + modularity analysis

**The key insight:** Nobody has built a tool that uses SNA graph metrics (PageRank, HITS, Louvain, betweenness) specifically for *security threat detection* in agent social networks. MoltWatch fills this gap.

---

## Quick Start

```bash
git clone https://github.com/iamakash-06/moltwatch
cd moltwatch
cp .env.example .env

# Start Neo4j (required for graph analysis)
docker compose up neo4j -d

# Install Python deps
uv sync

# Seed with synthetic data (no API needed)
uv run python scripts/seed_neo4j.py --dataset synthetic --num-agents 1000

# Run all analysis pipelines
uv run python scripts/run_analysis.py

# Start the API
uv run uvicorn moltwatch.api.main:app --port 8000

# Start the dashboard (separate terminal)
cd dashboard && npm install && npm run dev
# Open http://localhost:5173
```

---

## Use with Claude Desktop (MCP)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "moltwatch": {
      "command": "uv",
      "args": ["run", "--project", "/path/to/moltwatch", "moltwatch-mcp"],
      "env": {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "moltwatch"
      }
    }
  }
}
```

Then ask Claude:
- *"Show me suspicious coordination patterns in the agent network"*
- *"What's the blast radius if agent_x42 gets compromised?"*
- *"Which communities are echo chambers?"*

---

## Full Docker Stack

```bash
docker compose up -d
# Neo4j at http://localhost:7474
# API at http://localhost:8000
# Dashboard at http://localhost:5173
```

---

## Features

| Feature | Description |
|---------|-------------|
| 📊 **Graph visualization** | Sigma.js WebGL renderer, 50K+ nodes at 60fps |
| 🕵️ **CIB detection** | Temporal sync + content similarity + mutual upvote rings |
| 🧬 **Temporal analysis** | CoV classification (autonomous vs. human-driven agents) |
| 🎯 **Blast radius** | Independent Cascade Model cascade simulation |
| 🏗️ **Community analysis** | Louvain + echo chamber detection |
| 🤖 **MCP server** | 8 tools for conversational threat hunting with Claude |
| 📈 **Trust scoring** | Composite 0-100 score per agent |
| 🔌 **Static datasets** | Works offline with MoltGraph (arXiv 2603.00646) |

---

## Architecture

```
Data Layer          Graph Layer         Analysis Layer
─────────────       ─────────────       ──────────────
httpx scraper  ──▶  Neo4j GDS     ──▶  Centrality
SQLite WAL          Cypher queries      Community
Dataset loader      UNWIND ETL          Temporal (CoV)
                                        Anomaly/CIB
                                        Influence cascade
                                        Trust scoring
                                              │
                          ┌───────────────────┤
                          ▼                   ▼
                    MCP Server          FastAPI REST
                    (Claude Desktop)    (React dashboard)
                    8 tools             Sigma.js WebGL
```

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_network_overview` | Stats, top agents, Gini coefficients |
| `detect_campaigns` | Coordinated cluster detection |
| `find_injection_paths` | Prompt injection cascade simulation |
| `get_agent_trust` | Trust score + behavioral classification |
| `analyze_community` | Deep community analysis |
| `find_critical_nodes` | Highest blast radius agents |
| `detect_temporal_anomalies` | Burst events + synchronized posting |
| `get_agent_profile` | Full behavioral profile |

---

## Data Sources

1. **Synthetic** (always works): `python scripts/seed_neo4j.py --dataset synthetic`
   - Power-law degree distribution (α≈2.1), modularity Q≈0.9, 3-5 injected CIB clusters

2. **MoltGraph** (arXiv 2603.00646): 11,874 agents, 57,465 posts, 162,024 temporal edges
   ```bash
   python scripts/seed_neo4j.py --dataset moltgraph --data-dir ./data/moltgraph
   ```

3. **Live API**: Configure `MOLTBOOK_API_URL` in `.env` (may be unavailable post-Meta acquisition)

---

## Key References

- "Let There Be Claws" — Price et al., arXiv 2602.20044 (CoV analysis, HITS separation, Gini)
- "MoltGraph" — arXiv 2603.00646 (temporal graph dataset)
- "Emergence of Fragility" — arXiv 2603.23279 (core-periphery, network robustness)
- "Comparative Topology" — Zhu et al., arXiv 2602.13920 (Reddit vs Moltbook)
- Wiz Moltbook Security Research (1.5M API keys exposure)
- OWASP Top 10 for Agentic Applications 2026
- MITRE ATLAS framework (AI agent attack techniques)

---

## Contributing

PRs welcome. Open issues for bugs or feature requests.
