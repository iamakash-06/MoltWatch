"""
Coordinated Inauthentic Behavior (CIB) detection.
Combines temporal, structural, and content signals.
"""
import logging
from datetime import datetime, timezone, timedelta

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from neo4j import Driver

from moltwatch.analysis.temporal import TemporalAnalyzer, _parse_dt

logger = logging.getLogger(__name__)


class AnomalyDetector:
    def __init__(self, driver: Driver):
        self.driver = driver
        self.temporal = TemporalAnalyzer(driver)

    def detect_coordinated_clusters(
        self,
        time_tolerance_seconds: int = 60,
        min_cluster_size: int = 3,
        content_similarity_threshold: float = 0.5,
    ) -> list[dict]:
        """
        Multi-signal coordination detection:
        1. Temporal: agents posting within tight windows
        2. Structural: agents with similar interaction patterns (mutual upvoting)
        3. Content: agents posting semantically similar content (TF-IDF cosine)
        """
        clusters = []

        # Signal 1: Temporal synchronization
        sync_groups = self.temporal.detect_synchronized_posting(time_tolerance_seconds)
        for group in sync_groups:
            if group["agent_count"] >= min_cluster_size:
                clusters.append(
                    {
                        "agent_ids": group["agent_ids"],
                        "cluster_type": "temporal_sync",
                        "coordination_score": min(0.9, group["agent_count"] / 20.0),
                        "evidence_types": ["temporal_synchronization"],
                        "temporal_pattern": {
                            "window_start": group["window_start"],
                            "window_end": group["window_end"],
                            "tolerance_seconds": group["tolerance_seconds"],
                        },
                        "submolts": group["submolts"],
                        "severity": "HIGH" if group["agent_count"] >= 10 else "MEDIUM",
                    }
                )

        # Signal 2: Mutual upvoting rings
        vote_rings = self.detect_vote_manipulation(min_mutual_votes=3)
        for ring in vote_rings:
            clusters.append(
                {
                    "agent_ids": [ring["agent_a"], ring["agent_b"]],
                    "cluster_type": "vote_manipulation",
                    "coordination_score": min(0.95, ring["mutual_votes"] / 20.0),
                    "evidence_types": ["mutual_amplification"],
                    "mutual_votes": ring["mutual_votes"],
                    "severity": "HIGH" if ring["mutual_votes"] >= 10 else "MEDIUM",
                }
            )

        # Signal 3: Content similarity (TF-IDF on recent posts)
        content_clusters = self._detect_content_similarity(
            min_cluster_size=min_cluster_size,
            similarity_threshold=content_similarity_threshold,
        )
        clusters.extend(content_clusters)

        logger.info(f"Detected {len(clusters)} suspicious coordination clusters")
        return clusters

    def _detect_content_similarity(
        self, min_cluster_size: int = 3, similarity_threshold: float = 0.5
    ) -> list[dict]:
        """Detect agents posting semantically similar content via TF-IDF cosine similarity."""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (p:Post)
                WHERE p.title IS NOT NULL
                RETURN p.agent_id AS agent_id, p.title AS title, p.submolt AS submolt
                ORDER BY p.created_at DESC
                LIMIT 2000
                """
            )
            posts = [dict(r) for r in result]

        if len(posts) < min_cluster_size * 2:
            return []

        # Aggregate texts per agent
        agent_texts: dict[str, list[str]] = {}
        agent_submolts: dict[str, set] = {}
        for p in posts:
            aid = p["agent_id"]
            if aid not in agent_texts:
                agent_texts[aid] = []
                agent_submolts[aid] = set()
            if p["title"]:
                agent_texts[aid].append(p["title"])
            if p["submolt"]:
                agent_submolts[aid].add(p["submolt"])

        agent_ids = list(agent_texts.keys())
        if len(agent_ids) < min_cluster_size:
            return []

        corpus = [" ".join(agent_texts[aid][:20]) for aid in agent_ids]

        try:
            vectorizer = TfidfVectorizer(max_features=500, stop_words="english")
            tfidf = vectorizer.fit_transform(corpus)
            sim_matrix = cosine_similarity(tfidf)
        except Exception as e:
            logger.warning(f"TF-IDF similarity failed: {e}")
            return []

        # Find pairs with high similarity (same content, different agents)
        high_sim_pairs = []
        for i in range(len(agent_ids)):
            for j in range(i + 1, len(agent_ids)):
                if sim_matrix[i, j] >= similarity_threshold:
                    high_sim_pairs.append((agent_ids[i], agent_ids[j], float(sim_matrix[i, j])))

        if not high_sim_pairs:
            return []

        # Group into clusters using connected components
        adj: dict[str, set] = {}
        for a, b, _ in high_sim_pairs:
            adj.setdefault(a, set()).add(b)
            adj.setdefault(b, set()).add(a)

        visited = set()
        components = []
        for node in adj:
            if node in visited:
                continue
            component = set()
            stack = [node]
            while stack:
                n = stack.pop()
                if n in visited:
                    continue
                visited.add(n)
                component.add(n)
                stack.extend(adj[n] - visited)
            if len(component) >= min_cluster_size:
                components.append(list(component))

        clusters = []
        for component in components:
            avg_similarity = np.mean(
                [sim for a, b, sim in high_sim_pairs if a in component and b in component]
            )
            submolts = list({s for aid in component for s in agent_submolts.get(aid, set())})
            clusters.append(
                {
                    "agent_ids": component,
                    "cluster_type": "content_similarity",
                    "coordination_score": round(float(avg_similarity), 4),
                    "evidence_types": ["content_similarity"],
                    "avg_similarity": round(float(avg_similarity), 4),
                    "submolts": submolts[:5],
                    "severity": "MEDIUM",
                }
            )

        return clusters

    def detect_vote_manipulation(
        self, min_mutual_votes: int = 5, limit: int = 100
    ) -> list[dict]:
        """
        Detect vote rings: agents that systematically upvote each other.
        """
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (a:Agent)-[r1:UPVOTED]->(b:Agent)
                MATCH (b)-[r2:UPVOTED]->(a)
                WHERE a.id < b.id
                WITH a, b, count(r1) + count(r2) AS mutual_votes
                WHERE mutual_votes >= $min_votes
                RETURN a.id AS agent_a, b.id AS agent_b, mutual_votes
                ORDER BY mutual_votes DESC
                LIMIT $limit
                """,
                min_votes=min_mutual_votes,
                limit=limit,
            )
            return [dict(r) for r in result]

    def detect_rapid_community_formation(
        self, max_hours: int = 72, min_members: int = 10
    ) -> list[dict]:
        """
        Detect communities that form unusually quickly.
        Reference: "Crustafarianism" emerged in 72 hours on Moltbook.
        Natural communities form over weeks/months.
        """
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (a:Agent) WHERE a.community_id IS NOT NULL
                WITH a.community_id AS cid,
                     min(a.created_at) AS earliest,
                     max(a.created_at) AS latest,
                     count(a) AS size
                WHERE size >= $min_members
                RETURN cid, earliest, latest, size
                ORDER BY size DESC
                """,
                min_members=min_members,
            )
            communities = [dict(r) for r in result]

        rapid = []
        for comm in communities:
            earliest = _parse_dt(comm["earliest"])
            latest = _parse_dt(comm["latest"])
            if earliest and latest:
                formation_hours = (latest - earliest).total_seconds() / 3600
                if formation_hours <= max_hours:
                    rapid.append(
                        {
                            "community_id": comm["cid"],
                            "member_count": comm["size"],
                            "formation_hours": round(formation_hours, 1),
                            "earliest_member": comm["earliest"],
                            "latest_member": comm["latest"],
                            "severity": "HIGH" if formation_hours <= 24 else "MEDIUM",
                        }
                    )

        return rapid

    def compute_anomaly_scores(self) -> list[dict]:
        """
        Composite anomaly score per agent (0-1, higher = more suspicious).
        Components:
        - High CoV (bursty) → suspicious
        - Member of coordinated cluster → suspicious
        - Unusual upvote patterns → suspicious
        """
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (a:Agent)
                RETURN a.id AS id, a.name AS name,
                       a.cov_score AS cov_score,
                       a.trust_score AS trust_score,
                       a.karma AS karma
                """
            )
            agents = [dict(r) for r in result]

        coord_clusters = self.detect_coordinated_clusters(min_cluster_size=3)
        flagged_agents: dict[str, list[str]] = {}
        for cluster in coord_clusters:
            for aid in cluster.get("agent_ids", []):
                flagged_agents.setdefault(aid, []).append(cluster["cluster_type"])

        scores = []
        for agent in agents:
            anomaly_score = 0.0
            risk_flags = []

            # CoV signal: high CoV → more suspicious
            cov = agent.get("cov_score")
            if cov is not None:
                if cov > 3.0:
                    anomaly_score += 0.4
                    risk_flags.append("very_high_cov")
                elif cov > 1.5:
                    anomaly_score += 0.2
                    risk_flags.append("high_cov")

            # Cluster membership
            if agent["id"] in flagged_agents:
                anomaly_score += 0.4
                risk_flags.extend(flagged_agents[agent["id"]])

            # Trust score (inverse)
            trust = agent.get("trust_score")
            if trust is not None and trust < 30:
                anomaly_score += 0.2
                risk_flags.append("low_trust")

            anomaly_score = min(1.0, anomaly_score)
            scores.append(
                {
                    "id": agent["id"],
                    "name": agent["name"],
                    "anomaly_score": round(anomaly_score, 4),
                    "risk_flags": risk_flags,
                    "cov_score": cov,
                    "trust_score": trust,
                }
            )

        scores.sort(key=lambda x: x["anomaly_score"], reverse=True)
        return scores
