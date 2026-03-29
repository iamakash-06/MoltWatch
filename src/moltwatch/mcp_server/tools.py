"""
MoltWatch MCP Tools — 8 tools for conversational threat hunting.
All tools return JSON strings for Claude to interpret and present.
"""
import json
import logging
from mcp.server.fastmcp import Context

from moltwatch.mcp_server.server import mcp
from moltwatch.analysis.centrality import CentralityAnalyzer
from moltwatch.analysis.community import CommunityAnalyzer
from moltwatch.analysis.temporal import TemporalAnalyzer
from moltwatch.analysis.anomaly import AnomalyDetector
from moltwatch.analysis.influence import InfluenceModeler
from moltwatch.analysis.trust import TrustScorer, set_flagged_agents
from moltwatch.analysis.reports import ReportGenerator

logger = logging.getLogger(__name__)


def _json(data: object) -> str:
    return json.dumps(data, indent=2, default=str)


@mcp.tool()
async def get_network_overview(ctx: Context) -> str:
    """
    Get a high-level overview of the agent social network.
    Returns total agents, interactions, communities, modularity score,
    Gini coefficients, and top 10 agents by PageRank.
    """
    driver = ctx.request_context.lifespan_context.driver
    gds = ctx.request_context.lifespan_context.gds

    centrality = CentralityAnalyzer(driver, gds)
    community = CommunityAnalyzer(driver, gds)

    with driver.session() as session:
        result = session.run(
            """
            MATCH (a:Agent) WITH count(a) AS agents
            MATCH (s:Submolt) WITH agents, count(s) AS submolts
            OPTIONAL MATCH ()-[r:REPLIED_TO]->()
            RETURN agents, submolts, count(r) AS reply_edges
            """
        ).single()
        overview = dict(result) if result else {}

    communities = community.get_all_communities()
    modularity = community.compute_modularity()
    centrality_report = centrality.generate_centrality_report(top_n=10)

    return _json({
        "network": {
            **overview,
            "community_count": len(communities),
            "modularity": modularity,
        },
        "gini_coefficients": centrality_report["gini"],
        "top_agents_by_pagerank": centrality_report["top_agents_by_pagerank"],
        "summary": (
            f"Network has {overview.get('agents', 0)} agents across "
            f"{overview.get('submolts', 0)} submolts with {len(communities)} communities "
            f"(modularity Q={modularity:.3f})."
        ),
    })


@mcp.tool()
async def detect_campaigns(
    ctx: Context,
    min_cluster_size: int = 5,
    lookback_hours: int = 24,
) -> str:
    """
    Detect coordinated inauthentic behavior campaigns in the agent network.
    Analyzes temporal synchronization, structural patterns, and content similarity.
    Returns detected campaigns with agent IDs, evidence types, and risk scores.
    """
    driver = ctx.request_context.lifespan_context.driver
    anomaly = AnomalyDetector(driver)

    clusters = anomaly.detect_coordinated_clusters(
        min_cluster_size=min_cluster_size,
        time_tolerance_seconds=60,
    )
    vote_rings = anomaly.detect_vote_manipulation(min_mutual_votes=3)
    rapid = anomaly.detect_rapid_community_formation()

    # Populate flagged agents
    flagged = [aid for c in clusters for aid in c.get("agent_ids", [])]
    set_flagged_agents(flagged)

    return _json({
        "coordinated_clusters": clusters,
        "vote_manipulation_rings": vote_rings[:20],
        "rapid_community_formation": rapid[:10],
        "total_flagged_agents": len(set(flagged)),
        "summary": (
            f"Detected {len(clusters)} coordinated clusters, "
            f"{len(vote_rings)} vote manipulation rings, "
            f"{len(rapid)} rapidly-formed communities. "
            f"{len(set(flagged))} agents flagged total."
        ),
    })


@mcp.tool()
async def find_injection_paths(
    ctx: Context,
    source_agent: str,
    max_depth: int = 5,
) -> str:
    """
    Simulate how a prompt injection from a given agent propagates through the social graph.
    Returns propagation tree, total agents at risk, communities affected, and cascade estimate.
    Provide the agent NAME (e.g. 'agent_a42') or agent ID.
    """
    driver = ctx.request_context.lifespan_context.driver
    influence = InfluenceModeler(driver)

    # Resolve agent name to ID
    with driver.session() as session:
        result = session.run(
            "MATCH (a:Agent) WHERE a.name = $name OR a.id = $name RETURN a.id AS id LIMIT 1",
            name=source_agent,
        ).single()
        if not result:
            return _json({"error": f"Agent '{source_agent}' not found"})
        agent_id = result["id"]

    cascade = influence.simulate_cascade(agent_id, max_depth=max_depth, infection_rate=0.3)
    blast = influence.compute_blast_radius(agent_id)
    injection_paths = influence.detect_injection_propagation_paths(top_k=5)

    return _json({
        "source_agent": source_agent,
        "cascade_simulation": cascade,
        "blast_radius": blast,
        "top_injection_paths": injection_paths[:5],
        "summary": (
            f"Injection from '{source_agent}' could reach {cascade['total_reached']} agents "
            f"across {cascade['unique_communities_affected']} communities "
            f"(up to {max_depth} hops, p={cascade['infection_rate']})."
        ),
    })


@mcp.tool()
async def get_agent_trust(ctx: Context, agent_name: str) -> str:
    """
    Compute the trust score for a specific agent.
    Returns composite trust score (0-100), component breakdown,
    risk flags, and behavioral classification (autonomous vs human-driven).
    """
    driver = ctx.request_context.lifespan_context.driver
    trust = TrustScorer(driver)

    with driver.session() as session:
        result = session.run(
            "MATCH (a:Agent) WHERE a.name = $name OR a.id = $name RETURN a.id AS id LIMIT 1",
            name=agent_name,
        ).single()
        if not result:
            return _json({"error": f"Agent '{agent_name}' not found"})
        agent_id = result["id"]

    score = trust.compute_trust_score(agent_id)
    temporal = TemporalAnalyzer(driver)
    heartbeat = temporal.compute_heartbeat_fingerprint(agent_id)

    return _json({
        **score,
        "heartbeat": heartbeat,
        "interpretation": (
            f"Trust score {score['trust_score']}/100. "
            f"Behavioral class: {score['behavioral_class']}. "
            + (f"Risk flags: {', '.join(score['risk_flags'])}." if score["risk_flags"] else "No risk flags.")
        ),
    })


@mcp.tool()
async def analyze_community(ctx: Context, community_id: int) -> str:
    """
    Deep analysis of a specific community/cluster.
    Returns member count, top agents, internal density, external connections,
    formation timeline, dominant topics, and echo chamber risk score.
    """
    driver = ctx.request_context.lifespan_context.driver
    gds = ctx.request_context.lifespan_context.gds
    community_analyzer = CommunityAnalyzer(driver, gds)

    summary = community_analyzer.get_community_summary(community_id)
    echo_chambers = community_analyzer.detect_echo_chambers()
    echo = next((e for e in echo_chambers if e["community_id"] == community_id), None)

    return _json({
        "community": summary,
        "echo_chamber_assessment": echo,
        "summary": (
            f"Community {community_id}: {summary.get('member_count', 0)} members, "
            f"isolation ratio {summary.get('isolation_ratio', 0):.2f}. "
            + (f"Echo chamber risk: {echo['echo_chamber_risk']}." if echo else "No echo chamber risk detected.")
        ),
    })


@mcp.tool()
async def find_critical_nodes(ctx: Context, top_k: int = 10) -> str:
    """
    Identify the K agents whose compromise would cause the largest blast radius.
    Returns critical agents with blast radius metrics, bridged communities,
    and recommended monitoring priority.
    """
    driver = ctx.request_context.lifespan_context.driver
    influence = InfluenceModeler(driver)

    nodes = influence.find_critical_nodes(top_k=top_k)

    return _json({
        "critical_nodes": nodes,
        "summary": (
            f"Top {len(nodes)} critical nodes identified. "
            f"Most critical: '{nodes[0].get('name') if nodes else 'none'}' "
            f"with 2-hop blast radius of {nodes[0].get('blast_radius', {}).get('hop2', 0) if nodes else 0} agents."
        ),
    })


@mcp.tool()
async def detect_temporal_anomalies(
    ctx: Context, lookback_hours: int = 24
) -> str:
    """
    Detect temporal anomalies: burst events, synchronized posting, unusual heartbeat changes.
    Returns anomalies with timestamps, involved agents, and anomaly classifications.
    """
    driver = ctx.request_context.lifespan_context.driver
    temporal = TemporalAnalyzer(driver)

    bursts = temporal.detect_burst_events(window_minutes=30, threshold_posts=20)
    sync_groups = temporal.detect_synchronized_posting(time_tolerance_seconds=60)
    cov_classes = temporal.classify_agents_by_cov(threshold=1.0)

    return _json({
        "burst_events": bursts[:10],
        "synchronized_posting_groups": sync_groups[:10],
        "cov_summary": {
            "autonomous": len(cov_classes["autonomous"]),
            "human_driven": len(cov_classes["human_driven"]),
            "insufficient_data": len(cov_classes["insufficient_data"]),
        },
        "human_driven_sample": cov_classes["human_driven"][:5],
        "summary": (
            f"Found {len(bursts)} burst events, {len(sync_groups)} synchronized posting groups. "
            f"CoV classification: {len(cov_classes['autonomous'])} autonomous, "
            f"{len(cov_classes['human_driven'])} human-driven agents."
        ),
    })


@mcp.tool()
async def get_agent_profile(ctx: Context, agent_name: str) -> str:
    """
    Comprehensive behavioral profile of an agent: posting cadence, CoV score,
    heartbeat fingerprint, community memberships, interaction patterns,
    trust score, and centrality metrics.
    """
    driver = ctx.request_context.lifespan_context.driver

    with driver.session() as session:
        result = session.run(
            "MATCH (a:Agent) WHERE a.name = $name OR a.id = $name RETURN a LIMIT 1",
            name=agent_name,
        ).single()
        if not result:
            return _json({"error": f"Agent '{agent_name}' not found"})
        agent = dict(result["a"])
        agent_id = agent["id"]

        out_deg = session.run(
            "MATCH (a:Agent {id: $id})-[:REPLIED_TO]->(b) RETURN count(DISTINCT b) AS c",
            id=agent_id,
        ).single()["c"]
        in_deg = session.run(
            "MATCH (b)-[:REPLIED_TO]->(a:Agent {id: $id}) RETURN count(DISTINCT b) AS c",
            id=agent_id,
        ).single()["c"]
        submolts = session.run(
            "MATCH (a:Agent {id: $id})-[:POSTED_IN]->(s:Submolt) RETURN s.name AS name",
            id=agent_id,
        ).data()

    temporal = TemporalAnalyzer(driver)
    heartbeat = temporal.compute_heartbeat_fingerprint(agent_id)
    trust = TrustScorer(driver)
    trust_data = trust.compute_trust_score(agent_id)

    return _json({
        "agent": {
            **agent,
            "out_degree": out_deg,
            "in_degree": in_deg,
            "submolts": [s["name"] for s in submolts],
        },
        "heartbeat": heartbeat,
        "trust": trust_data,
        "summary": (
            f"Agent '{agent_name}': karma={agent.get('karma', 0)}, "
            f"community={agent.get('community_id', 'unknown')}, "
            f"trust={trust_data.get('trust_score', 0)}/100, "
            f"class={trust_data.get('behavioral_class', 'unknown')}, "
            f"CoV={heartbeat.get('cov', 'N/A')}."
        ),
    })
