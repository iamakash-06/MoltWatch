"""
Centrality metrics via Neo4j GDS.

References:
- "Let There Be Claws" (arXiv 2602.20044): top 1% agents capture 97%+ engagement,
  clean hub/authority separation, upvote Gini = 0.99
"""
import logging
from neo4j import Driver
from graphdatascience import GraphDataScience

logger = logging.getLogger(__name__)

GRAPH_NAME = "agent_reply_graph"


def _ensure_graph_projection(gds: GraphDataScience, force: bool = False) -> bool:
    """Project agent reply graph into GDS memory, returning True if (re)created."""
    exists = gds.graph.exists(GRAPH_NAME)
    if exists.get("exists", False):
        if not force:
            return False
        gds.graph.drop(GRAPH_NAME)
    gds.graph.project(GRAPH_NAME, "Agent", "REPLIED_TO")
    logger.info(f"Projected GDS graph '{GRAPH_NAME}'")
    return True


class CentralityAnalyzer:
    def __init__(self, driver: Driver, gds: GraphDataScience):
        self.driver = driver
        self.gds = gds

    def run_pagerank(
        self, damping_factor: float = 0.85, iterations: int = 20, force_reproject: bool = False
    ):
        """
        Run PageRank on agent reply graph, write to a.pagerank.
        Reference: "Let There Be Claws" — top 1% of agents capture 97%+ of engagement.
        """
        _ensure_graph_projection(self.gds, force=force_reproject)
        G = self.gds.graph.get(GRAPH_NAME)
        result = self.gds.pageRank.write(
            G,
            writeProperty="pagerank",
            dampingFactor=damping_factor,
            maxIterations=iterations,
        )
        logger.info(f"PageRank complete: {result.get('nodePropertiesWritten', 0)} nodes written")
        return result

    def run_hits(self, force_reproject: bool = False):
        """
        Compute HITS hub and authority scores.
        Reference: "Let There Be Claws" — clean hub/authority separation on Moltbook
        (unlike human networks where roles overlap).
        Hubs = agents that comment on many authority posts.
        Authorities = agents that receive many comments/upvotes.
        """
        _ensure_graph_projection(self.gds, force=force_reproject)
        G = self.gds.graph.get(GRAPH_NAME)
        result = self.gds.hits.write(
            G,
            hubProperty="hub_score",
            authProperty="authority_score",
        )
        logger.info(f"HITS complete: {result.get('nodePropertiesWritten', 0)} nodes written")
        return result

    def run_betweenness(
        self, sampling_size: int = 10000, force_reproject: bool = False
    ):
        """
        Betweenness centrality — identifies bridge agents controlling information flow.
        These are critical nodes for influence propagation.
        Uses sampling for performance on large graphs.
        """
        _ensure_graph_projection(self.gds, force=force_reproject)
        G = self.gds.graph.get(GRAPH_NAME)
        result = self.gds.betweenness.write(
            G,
            writeProperty="betweenness",
            samplingSize=sampling_size,
        )
        logger.info(f"Betweenness complete: {result.get('nodePropertiesWritten', 0)} nodes written")
        return result

    def compute_gini_coefficient(self, metric: str = "karma") -> float:
        """
        Gini coefficient for a given metric across all agents.
        Reference: Moltbook upvote Gini = 0.99, posting Gini = 0.60.
        Returns 0 (equality) to 1 (one agent has everything).
        """
        with self.driver.session() as session:
            result = session.run(
                f"MATCH (a:Agent) WHERE a.{metric} IS NOT NULL "
                f"RETURN a.{metric} AS value ORDER BY value"
            )
            values = [r["value"] for r in result if r["value"] is not None]

        if not values:
            return 0.0

        n = len(values)
        total = sum(values)
        if total == 0:
            return 0.0

        # G = (2 * sum(i * x_i)) / (n * sum(x_i)) - (n + 1) / n
        weighted_sum = sum((i + 1) * x for i, x in enumerate(values))
        gini = (2 * weighted_sum) / (n * total) - (n + 1) / n
        return round(gini, 4)

    def generate_centrality_report(self, top_n: int = 20) -> dict:
        """Comprehensive centrality report: top agents, Gini coefficients, distributions."""
        with self.driver.session() as session:
            # Top agents by PageRank
            result = session.run(
                """
                MATCH (a:Agent) WHERE a.pagerank IS NOT NULL
                RETURN a.id AS id, a.name AS name, a.pagerank AS pagerank,
                       a.karma AS karma, a.community_id AS community_id,
                       a.hub_score AS hub_score, a.authority_score AS authority_score
                ORDER BY a.pagerank DESC LIMIT $n
                """,
                n=top_n,
            )
            top_by_pagerank = [dict(r) for r in result]

            # Degree distribution sample
            result = session.run(
                """
                MATCH (a:Agent)
                OPTIONAL MATCH (a)-[out:REPLIED_TO]->()
                OPTIONAL MATCH ()-[in:REPLIED_TO]->(a)
                WITH a, count(DISTINCT out) AS out_deg, count(DISTINCT in) AS in_deg
                RETURN a.id AS id, out_deg, in_deg, out_deg + in_deg AS total_deg
                ORDER BY total_deg DESC LIMIT $n
                """,
                n=top_n,
            )
            top_by_degree = [dict(r) for r in result]

        karma_gini = self.compute_gini_coefficient("karma")
        pagerank_gini = self.compute_gini_coefficient("pagerank")

        return {
            "top_agents_by_pagerank": top_by_pagerank,
            "top_agents_by_degree": top_by_degree,
            "gini": {
                "karma": karma_gini,
                "pagerank": pagerank_gini,
            },
        }
