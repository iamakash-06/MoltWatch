"""MCP prompt templates for guided threat analysis workflows."""
from moltwatch.mcp_server.server import mcp


@mcp.prompt()
def investigate_suspicious_activity() -> str:
    """Guide through investigating suspicious agent activity in the network."""
    return """You are a security analyst investigating the MoltWatch agent social network.
Follow this workflow:

1. Start with `get_network_overview` to understand the current network state.
2. Use `detect_campaigns` to find coordinated inauthentic behavior.
3. For each suspicious cluster, use `get_agent_profile` on key members.
4. Check temporal patterns with `detect_temporal_anomalies`.
5. Summarize findings with: which agents are suspicious, what patterns indicate coordination,
   and what the likely attack vector is.

Focus on: temporal synchronization, mutual upvoting, content similarity, and
unusually rapid community formation."""


@mcp.prompt()
def full_network_threat_report() -> str:
    """Generate a comprehensive threat intelligence report."""
    return """Generate a full MoltWatch threat intelligence report:

1. `get_network_overview` → note modularity, Gini coefficients, top agents
2. `detect_campaigns` → enumerate all detected threat clusters
3. `find_critical_nodes` with top_k=20 → identify highest-risk agents
4. `detect_temporal_anomalies` → temporal threat landscape
5. For each critical node, `find_injection_paths` to assess blast radius

Format your final output as a structured threat report with:
- EXECUTIVE SUMMARY (2-3 sentences)
- NETWORK HEALTH METRICS (modularity, Gini, community structure)
- ACTIVE THREATS (each cluster with severity, evidence, agents)
- CRITICAL INFRASTRUCTURE (top 5 nodes that need monitoring)
- RECOMMENDATIONS (prioritized action items)"""


@mcp.prompt()
def analyze_agent_behavior(agent_name: str) -> str:
    """Deep behavioral analysis of a specific agent."""
    return f"""Perform a deep behavioral analysis of agent '{agent_name}':

1. `get_agent_profile` for '{agent_name}' → baseline metrics
2. `get_agent_trust` for '{agent_name}' → trust score and risk flags
3. `find_injection_paths` with source_agent='{agent_name}' → influence reach
4. If the agent is in a community (check community_id from profile),
   use `analyze_community` on that community_id

Conclude with: Is this agent autonomous or human-driven? What is their influence reach?
Are there any red flags? What is the recommended monitoring level (none/watch/alert/block)?"""


@mcp.prompt()
def detect_influence_operation(target_topic: str) -> str:
    """Investigate a potential influence operation around a topic."""
    return f"""Investigate whether there's a coordinated influence operation around '{target_topic}':

1. `detect_campaigns` with min_cluster_size=3 → find all active clusters
2. `detect_temporal_anomalies` → look for synchronized posting spikes
3. `find_critical_nodes` → identify agents best positioned to amplify '{target_topic}'
4. Cross-reference: which critical nodes are also in coordinated clusters?

Report on:
- Whether a coordinated campaign targeting '{target_topic}' exists
- The agents most likely involved
- How far the influence could spread (blast radius)
- The confidence level of your assessment"""
