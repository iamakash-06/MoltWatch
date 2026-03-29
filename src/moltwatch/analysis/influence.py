"""
Influence propagation modeling.
Models how information/manipulation cascades through the agent social graph.
Uses the Independent Cascade Model.
"""
import logging
import random
from collections import defaultdict, deque

from neo4j import Driver

logger = logging.getLogger(__name__)


class InfluenceModeler:
    def __init__(self, driver: Driver):
        self.driver = driver

    def simulate_cascade(
        self,
        source_agent_id: str,
        max_depth: int = 5,
        infection_rate: float = 0.3,
        seed: int = 42,
    ) -> dict:
        """
        Independent Cascade Model simulation from a source agent.
        Each infected agent attempts to infect reply-graph neighbors with `infection_rate`.

        Returns: total_reached, depth_distribution, cascade_tree
        """
        rng = random.Random(seed)

        # Load the outgoing reply graph for relevant agents
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH path = (source:Agent {id: $agent_id})-[:REPLIED_TO*1..$depth]->(target:Agent)
                RETURN DISTINCT source.id AS src, target.id AS tgt
                """,
                agent_id=source_agent_id,
                depth=max_depth,
            )
            edges_raw = [(r["src"], r["tgt"]) for r in result]

        if not edges_raw:
            # Fallback: just get direct neighbors
            with self.driver.session() as session:
                result = session.run(
                    "MATCH (a:Agent {id: $id})-[:REPLIED_TO]->(b:Agent) "
                    "RETURN b.id AS tgt",
                    id=source_agent_id,
                )
                edges_raw = [(source_agent_id, r["tgt"]) for r in result]

        # Build adjacency list
        adj: dict[str, list[str]] = defaultdict(list)
        for src, tgt in edges_raw:
            adj[src].append(tgt)

        # Run Independent Cascade
        infected = {source_agent_id}
        newly_infected = {source_agent_id}
        cascade_tree: dict[str, dict] = {source_agent_id: {"depth": 0, "infected_by": None}}
        depth_distribution: dict[int, int] = {0: 1}

        for depth in range(1, max_depth + 1):
            next_wave = set()
            for agent in newly_infected:
                for neighbor in adj.get(agent, []):
                    if neighbor not in infected and rng.random() < infection_rate:
                        next_wave.add(neighbor)
                        cascade_tree[neighbor] = {"depth": depth, "infected_by": agent}
            if not next_wave:
                break
            infected |= next_wave
            newly_infected = next_wave
            depth_distribution[depth] = len(next_wave)

        # Get community info for reached agents
        reached_list = list(infected - {source_agent_id})
        unique_communities: set = set()
        if reached_list:
            with self.driver.session() as session:
                result = session.run(
                    "UNWIND $ids AS id MATCH (a:Agent {id: id}) "
                    "RETURN a.community_id AS community_id",
                    ids=reached_list[:1000],
                )
                for r in result:
                    if r["community_id"] is not None:
                        unique_communities.add(r["community_id"])

        return {
            "source_agent_id": source_agent_id,
            "total_reached": len(infected) - 1,
            "depth_distribution": depth_distribution,
            "reached_agents": reached_list[:100],
            "unique_communities_affected": len(unique_communities),
            "infection_rate": infection_rate,
            "max_depth": max_depth,
        }

    def find_critical_nodes(self, top_k: int = 20) -> list[dict]:
        """
        K agents whose compromise causes the largest cascade.
        Ranks by: betweenness centrality + out-degree + community bridging.
        """
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (a:Agent)
                OPTIONAL MATCH (a)-[out:REPLIED_TO]->()
                WITH a, count(DISTINCT out) AS out_degree
                OPTIONAL MATCH (a)-[:REPLIED_TO]->(b:Agent)
                WHERE b.community_id <> a.community_id
                WITH a, out_degree, count(DISTINCT b) AS cross_community_reach
                RETURN a.id AS id, a.name AS name,
                       a.betweenness AS betweenness,
                       a.pagerank AS pagerank,
                       a.community_id AS community_id,
                       out_degree,
                       cross_community_reach,
                       coalesce(a.betweenness, 0) * 0.4
                         + coalesce(a.pagerank, 0) * 1000 * 0.3
                         + out_degree * 0.2
                         + cross_community_reach * 0.1 AS criticality_score
                ORDER BY criticality_score DESC
                LIMIT $k
                """,
                k=top_k,
            )
            nodes = [dict(r) for r in result]

        # Add blast radius for each critical node
        for node in nodes:
            blast = self.compute_blast_radius(node["id"])
            node["blast_radius"] = {
                "hop1": blast["hop1_reach"],
                "hop2": blast["hop2_reach"],
                "communities": blast["unique_communities"],
            }

        return nodes

    def compute_blast_radius(self, agent_id: str) -> dict:
        """1/2/3-hop reach + unique communities reachable."""
        with self.driver.session() as session:
            hop1 = session.run(
                "MATCH (a:Agent {id: $id})-[:REPLIED_TO]->(b:Agent) "
                "RETURN count(DISTINCT b) AS count",
                id=agent_id,
            ).single()["count"]

            hop2 = session.run(
                "MATCH (a:Agent {id: $id})-[:REPLIED_TO*1..2]->(b:Agent) "
                "WHERE b.id <> $id RETURN count(DISTINCT b) AS count",
                id=agent_id,
            ).single()["count"]

            hop3 = session.run(
                "MATCH (a:Agent {id: $id})-[:REPLIED_TO*1..3]->(b:Agent) "
                "WHERE b.id <> $id RETURN count(DISTINCT b) AS count",
                id=agent_id,
            ).single()["count"]

            communities = session.run(
                "MATCH (a:Agent {id: $id})-[:REPLIED_TO*1..3]->(b:Agent) "
                "WHERE b.id <> $id RETURN count(DISTINCT b.community_id) AS count",
                id=agent_id,
            ).single()["count"]

        return {
            "agent_id": agent_id,
            "hop1_reach": hop1,
            "hop2_reach": hop2,
            "hop3_reach": hop3,
            "unique_communities": communities,
        }

    def detect_injection_propagation_paths(
        self, top_k: int = 10
    ) -> list[dict]:
        """
        Identify high-risk propagation paths for prompt injection.
        An injection posted by Agent A propagates through the reply graph:
        A's post read by B → B replies → C reads B → etc.
        Returns high-risk chains by path length and community span.
        """
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (a:Agent)
                WHERE a.betweenness IS NOT NULL
                WITH a ORDER BY a.betweenness DESC LIMIT 50
                MATCH path = (a)-[:REPLIED_TO*1..4]->(b:Agent)
                WHERE a.community_id <> b.community_id
                RETURN a.id AS source, a.name AS source_name,
                       b.id AS sink, b.name AS sink_name,
                       length(path) AS path_length,
                       [n IN nodes(path) | n.id] AS path_nodes,
                       [n IN nodes(path) | n.community_id] AS path_communities
                ORDER BY path_length DESC
                LIMIT $k
                """,
                k=top_k,
            )
            paths = [dict(r) for r in result]

        return [
            {
                "source_agent": p["source"],
                "source_name": p["source_name"],
                "sink_agent": p["sink"],
                "sink_name": p["sink_name"],
                "path_length": p["path_length"],
                "path_agents": p["path_nodes"],
                "communities_crossed": len(set(c for c in (p["path_communities"] or []) if c is not None)),
                "risk_level": "HIGH" if p["path_length"] >= 3 else "MEDIUM",
            }
            for p in paths
        ]
