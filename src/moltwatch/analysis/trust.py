"""
Agent trust scoring — composite metric distinguishing genuine agents from manipulated ones.
Higher trust = autonomous, consistent, organic behavior.
Lower trust = human-manipulated, coordinated, or anomalous.
"""
import logging
from datetime import datetime, timezone, timedelta

import numpy as np
from neo4j import Driver

from moltwatch.analysis.temporal import _compute_cov, _parse_dt

logger = logging.getLogger(__name__)

# Component weights (sum to 1.0)
WEIGHTS = {
    "temporal_regularity": 0.25,
    "account_age": 0.15,
    "reciprocity": 0.15,
    "community_diversity": 0.15,
    "content_originality": 0.15,
    "not_in_cluster": 0.15,
}

# Known coordinated agent IDs (populated after anomaly detection)
_FLAGGED_AGENT_IDS: set[str] = set()


def set_flagged_agents(agent_ids: list[str]):
    """Register agents flagged by anomaly detection as cluster members."""
    global _FLAGGED_AGENT_IDS
    _FLAGGED_AGENT_IDS = set(agent_ids)


class TrustScorer:
    def __init__(self, driver: Driver):
        self.driver = driver

    def compute_trust_score(self, agent_id: str) -> dict:
        """
        Composite trust score (0-100):
        - Temporal regularity (CoV): autonomous agents have regular intervals    [25%]
        - Account age: older accounts are more established                       [15%]
        - Interaction reciprocity: some reciprocity is healthy                   [15%]
        - Community diversity: participates across communities                   [15%]
        - Content originality: unique content, not copy of others               [15%]
        - Not in flagged cluster                                                 [15%]
        """
        with self.driver.session() as session:
            agent = session.run(
                "MATCH (a:Agent {id: $id}) RETURN a", id=agent_id
            ).single()
            if not agent:
                return {"trust_score": 0, "error": "agent not found"}
            a = dict(agent["a"])

        components = {}
        risk_flags = []
        now = datetime.now(timezone.utc)

        # 1. Temporal regularity (CoV)
        with self.driver.session() as session:
            result = session.run(
                "MATCH (p:Post {agent_id: $id}) RETURN p.created_at AS ts ORDER BY p.created_at",
                id=agent_id,
            )
            timestamps = [_parse_dt(r["ts"]) for r in result]
            timestamps = [t for t in timestamps if t is not None]

        cov = _compute_cov(timestamps)
        if cov is None:
            components["temporal_regularity"] = 0.5  # neutral if insufficient data
        elif cov <= 0.3:
            components["temporal_regularity"] = 1.0  # very regular
        elif cov <= 1.0:
            components["temporal_regularity"] = 0.8  # autonomous range
        elif cov <= 2.0:
            components["temporal_regularity"] = 0.4  # bursty
            risk_flags.append("high_cov")
        else:
            components["temporal_regularity"] = 0.1  # very bursty
            risk_flags.append("very_high_cov")

        # 2. Account age
        created_at = _parse_dt(a.get("created_at"))
        if created_at:
            age_days = (now - created_at).days
            if age_days > 365:
                components["account_age"] = 1.0
            elif age_days > 90:
                components["account_age"] = 0.7
            elif age_days > 30:
                components["account_age"] = 0.4
            else:
                components["account_age"] = 0.1
                risk_flags.append("new_account")
        else:
            components["account_age"] = 0.5

        # 3. Interaction reciprocity
        with self.driver.session() as session:
            out_deg = session.run(
                "MATCH (a:Agent {id: $id})-[:REPLIED_TO]->(b) RETURN count(DISTINCT b) AS c",
                id=agent_id,
            ).single()["c"]
            in_deg = session.run(
                "MATCH (b)-[:REPLIED_TO]->(a:Agent {id: $id}) RETURN count(DISTINCT b) AS c",
                id=agent_id,
            ).single()["c"]

        total = out_deg + in_deg
        if total == 0:
            components["reciprocity"] = 0.3
        else:
            reciprocity_ratio = min(out_deg, in_deg) / max(out_deg, in_deg) if max(out_deg, in_deg) > 0 else 0
            if 0.1 <= reciprocity_ratio <= 0.9:
                components["reciprocity"] = 0.8
            elif reciprocity_ratio < 0.05:
                components["reciprocity"] = 0.3  # pure broadcaster or pure receiver
            else:
                components["reciprocity"] = 0.6

        # 4. Community diversity
        with self.driver.session() as session:
            result = session.run(
                "MATCH (a:Agent {id: $id})-[:POSTED_IN]->(s:Submolt) "
                "RETURN count(DISTINCT s) AS count",
                id=agent_id,
            )
            submolt_count = result.single()["count"]

        if submolt_count >= 5:
            components["community_diversity"] = 1.0
        elif submolt_count >= 3:
            components["community_diversity"] = 0.7
        elif submolt_count >= 1:
            components["community_diversity"] = 0.4
        else:
            components["community_diversity"] = 0.2
            risk_flags.append("single_submolt")

        # 5. Content originality (proxy: karma per post ratio)
        karma = a.get("karma", 0) or 0
        post_count = max(1, a.get("post_count", 1) or 1)
        karma_per_post = karma / post_count
        if karma_per_post > 50:
            components["content_originality"] = 1.0
        elif karma_per_post > 10:
            components["content_originality"] = 0.7
        elif karma_per_post > 1:
            components["content_originality"] = 0.4
        else:
            components["content_originality"] = 0.2

        # 6. Not in flagged cluster
        if agent_id in _FLAGGED_AGENT_IDS:
            components["not_in_cluster"] = 0.0
            risk_flags.append("in_coordinated_cluster")
        else:
            components["not_in_cluster"] = 1.0

        # Compute weighted composite score (0-100)
        raw_score = sum(components[k] * WEIGHTS[k] for k in components)
        trust_score = round(raw_score * 100, 1)

        return {
            "agent_id": agent_id,
            "trust_score": trust_score,
            "components": {k: round(v * 100, 1) for k, v in components.items()},
            "risk_flags": risk_flags,
            "behavioral_class": "autonomous" if (cov is not None and cov <= 1.0) else
                                "human_driven" if (cov is not None and cov > 1.0) else "unknown",
        }

    def compute_all_trust_scores(self, batch_write: bool = True) -> list[dict]:
        """Batch compute trust scores for all agents, write to Neo4j."""
        with self.driver.session() as session:
            result = session.run("MATCH (a:Agent) RETURN a.id AS id")
            agent_ids = [r["id"] for r in result]

        scores = []
        updates = []
        for agent_id in agent_ids:
            score_data = self.compute_trust_score(agent_id)
            scores.append(score_data)
            updates.append({"id": agent_id, "trust_score": score_data["trust_score"]})

        if batch_write and updates:
            with self.driver.session() as session:
                session.run(
                    """
                    UNWIND $updates AS row
                    MATCH (a:Agent {id: row.id})
                    SET a.trust_score = row.trust_score
                    """,
                    updates=updates,
                )
            logger.info(f"Wrote trust scores for {len(updates)} agents")

        return scores

    def get_low_trust_agents(
        self, threshold: float = 30.0, limit: int = 100
    ) -> list[dict]:
        """Return agents below trust threshold, sorted ascending by trust score."""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (a:Agent)
                WHERE a.trust_score IS NOT NULL AND a.trust_score <= $threshold
                RETURN a.id AS id, a.name AS name, a.trust_score AS trust_score,
                       a.community_id AS community_id, a.cov_score AS cov_score
                ORDER BY a.trust_score ASC
                LIMIT $limit
                """,
                threshold=threshold,
                limit=limit,
            )
            return [dict(r) for r in result]
