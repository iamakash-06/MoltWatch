"""
Community detection and analysis.

References:
- MoltGraph (arXiv 2603.00646): modularity Q ≈ 0.9 on Moltbook
- "Emergence of Fragility" (arXiv 2603.23279): core-periphery structure
"""
import logging
from neo4j import Driver
from graphdatascience import GraphDataScience

logger = logging.getLogger(__name__)

GRAPH_NAME = "agent_reply_graph"


class CommunityAnalyzer:
    def __init__(self, driver: Driver, gds: GraphDataScience):
        self.driver = driver
        self.gds = gds

    def _get_graph(self):
        return self.gds.graph.get(GRAPH_NAME)

    def run_louvain(self, resolution: float = 1.0) -> dict:
        """
        Louvain community detection, writes community_id to each Agent node.
        Reference: MoltGraph found modularity Q ≈ 0.9 (extreme clustering).
        """
        G = self._get_graph()
        result = self.gds.louvain.write(
            G,
            writeProperty="community_id",
            includeIntermediateCommunities=False,
        )
        communities_count = result.get("communityCount", 0)
        modularity = result.get("modularity", 0.0)
        logger.info(
            f"Louvain complete: {communities_count} communities, modularity={modularity:.4f}"
        )
        return {"communities": communities_count, "modularity": modularity}

    def run_label_propagation(self) -> dict:
        """Label propagation — fast alternative to Louvain for comparison."""
        G = self._get_graph()
        result = self.gds.labelPropagation.write(
            G,
            writeProperty="lpa_community_id",
        )
        communities_count = result.get("communityCount", 0)
        logger.info(f"Label propagation: {communities_count} communities")
        return {"communities": communities_count}

    def compute_modularity(self) -> float:
        """
        Compute modularity Q of detected communities.
        Q > 0.3 = significant structure; Q > 0.7 = strong; Q > 0.9 = extreme (Moltbook).
        """
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (a:Agent) WHERE a.community_id IS NOT NULL
                WITH a.community_id AS comm, count(*) AS size
                WITH collect({comm: comm, size: size}) AS communities,
                     sum(size) AS total_nodes
                UNWIND communities AS c
                MATCH (a:Agent {community_id: c.comm})-[r:REPLIED_TO]->(b:Agent {community_id: c.comm})
                WITH c, total_nodes, count(r) AS internal_edges
                MATCH ()-[all_r:REPLIED_TO]->()
                WITH c, total_nodes, internal_edges, count(all_r) AS total_edges
                RETURN c.comm AS comm, c.size AS size, internal_edges, total_edges, total_nodes
                """
            )
            rows = [dict(r) for r in result]

        if not rows or rows[0]["total_edges"] == 0:
            return 0.0

        total_edges = rows[0]["total_edges"]
        q = 0.0
        for row in rows:
            e_c = row["internal_edges"] / total_edges
            a_c = row["size"] / row["total_nodes"]
            q += e_c - a_c ** 2
        return round(q, 4)

    def detect_echo_chambers(self, modularity_threshold: float = 0.8) -> list[dict]:
        """
        Flag communities with high internal density and low external connectivity.
        These are potential echo chambers or coordinated groups.
        """
        with self.driver.session() as session:
            # Get all communities
            result = session.run(
                """
                MATCH (a:Agent) WHERE a.community_id IS NOT NULL
                RETURN a.community_id AS community_id, count(a) AS size
                ORDER BY size DESC
                """
            )
            communities = [dict(r) for r in result]

        suspicious = []
        for comm in communities:
            if comm["size"] < 5:
                continue
            cid = comm["community_id"]
            with self.driver.session() as session:
                internal = session.run(
                    """
                    MATCH (a:Agent {community_id: $cid})-[r:REPLIED_TO]->(b:Agent {community_id: $cid})
                    RETURN count(r) AS count
                    """,
                    cid=cid,
                ).single()["count"]

                external = session.run(
                    """
                    MATCH (a:Agent {community_id: $cid})-[r:REPLIED_TO]->(b:Agent)
                    WHERE b.community_id <> $cid
                    RETURN count(r) AS count
                    """,
                    cid=cid,
                ).single()["count"]

            total = internal + external
            if total == 0:
                continue
            isolation_ratio = internal / total
            if isolation_ratio >= modularity_threshold:
                suspicious.append(
                    {
                        "community_id": cid,
                        "size": comm["size"],
                        "internal_edges": internal,
                        "external_edges": external,
                        "isolation_ratio": round(isolation_ratio, 4),
                        "echo_chamber_risk": "HIGH" if isolation_ratio > 0.95 else "MEDIUM",
                    }
                )

        suspicious.sort(key=lambda x: x["isolation_ratio"], reverse=True)
        return suspicious

    def get_community_summary(self, community_id: int) -> dict:
        """Summary of a community: top agents, dominant submolts, density, timeline."""
        with self.driver.session() as session:
            # Member count and stats
            stats = session.run(
                """
                MATCH (a:Agent {community_id: $cid})
                RETURN count(a) AS member_count,
                       avg(a.karma) AS avg_karma,
                       avg(coalesce(a.pagerank, 0)) AS avg_pagerank,
                       min(a.created_at) AS earliest_member,
                       max(a.created_at) AS latest_member
                """,
                cid=community_id,
            ).single()

            # Top agents
            top_agents = session.run(
                """
                MATCH (a:Agent {community_id: $cid})
                RETURN a.id AS id, a.name AS name, a.karma AS karma,
                       a.pagerank AS pagerank, a.trust_score AS trust_score
                ORDER BY coalesce(a.pagerank, 0) DESC LIMIT 10
                """,
                cid=community_id,
            ).data()

            # Internal/external edges
            internal = session.run(
                """
                MATCH (a:Agent {community_id: $cid})-[r:REPLIED_TO]->(b:Agent {community_id: $cid})
                RETURN count(r) AS count
                """,
                cid=community_id,
            ).single()["count"]

            external = session.run(
                """
                MATCH (a:Agent {community_id: $cid})-[r:REPLIED_TO]->(b:Agent)
                WHERE b.community_id <> $cid
                RETURN count(r) AS count
                """,
                cid=community_id,
            ).single()["count"]

            # Dominant submolts
            submolts = session.run(
                """
                MATCH (a:Agent {community_id: $cid})-[:POSTED_IN]->(s:Submolt)
                RETURN s.name AS submolt, count(*) AS posts
                ORDER BY posts DESC LIMIT 5
                """,
                cid=community_id,
            ).data()

        total = internal + external
        return {
            "community_id": community_id,
            "member_count": stats["member_count"] if stats else 0,
            "avg_karma": round(stats["avg_karma"] or 0, 2) if stats else 0,
            "avg_pagerank": round(stats["avg_pagerank"] or 0, 6) if stats else 0,
            "earliest_member": stats["earliest_member"] if stats else None,
            "latest_member": stats["latest_member"] if stats else None,
            "top_agents": top_agents,
            "internal_edges": internal,
            "external_edges": external,
            "isolation_ratio": round(internal / total, 4) if total > 0 else 0,
            "dominant_submolts": submolts,
        }

    def get_all_communities(self) -> list[dict]:
        """List all communities with basic stats."""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (a:Agent) WHERE a.community_id IS NOT NULL
                RETURN a.community_id AS community_id, count(a) AS member_count
                ORDER BY member_count DESC
                """
            )
            return [dict(r) for r in result]
