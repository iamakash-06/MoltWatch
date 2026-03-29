"""
Temporal signature analysis.

The key insight: agents with CoV ≤ 1.0 are scheduled processes (autonomous);
agents with CoV > 1.0 show bursty, human-driven patterns.

Reference: "Let There Be Claws" (arXiv 2602.20044)
- After Feb 2026 Moltbook security breach, 87.7% of returning agents had high CoV
  (suggesting human manual re-authentication)
- OpenClaw heartbeats: 30min to 4 hours
"""
import logging
from datetime import datetime, timezone
from collections import defaultdict

import numpy as np
from neo4j import Driver

logger = logging.getLogger(__name__)


def _parse_dt(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _compute_cov(timestamps: list[datetime]) -> float | None:
    """Compute Coefficient of Variation of inter-post intervals."""
    if len(timestamps) < 5:
        return None
    sorted_ts = sorted(timestamps)
    intervals = [
        (sorted_ts[i + 1] - sorted_ts[i]).total_seconds()
        for i in range(len(sorted_ts) - 1)
    ]
    intervals = [x for x in intervals if x > 0]
    if not intervals or np.mean(intervals) == 0:
        return None
    return float(np.std(intervals) / np.mean(intervals))


class TemporalAnalyzer:
    def __init__(self, driver: Driver):
        self.driver = driver

    def compute_cov_for_agent(self, agent_id: str) -> float | None:
        """
        CoV = σ/μ of inter-post intervals.
        Returns None if agent has <5 posts.
        CoV ≤ 1.0 → autonomous (scheduled); CoV > 1.0 → human-driven (bursty).
        """
        with self.driver.session() as session:
            result = session.run(
                "MATCH (p:Post {agent_id: $agent_id}) "
                "RETURN p.created_at AS ts ORDER BY p.created_at",
                agent_id=agent_id,
            )
            timestamps = [_parse_dt(r["ts"]) for r in result]
            timestamps = [t for t in timestamps if t is not None]
        return _compute_cov(timestamps)

    def classify_agents_by_cov(
        self, threshold: float = 1.0, min_posts: int = 5
    ) -> dict:
        """
        Classify all agents with sufficient posts as autonomous or human_driven.
        Writes cov_score back to Neo4j agents.
        """
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (a:Agent)
                WHERE a.post_count >= $min_posts
                RETURN a.id AS id, a.name AS name
                """,
                min_posts=min_posts,
            )
            agents = [dict(r) for r in result]

        autonomous, human_driven, insufficient = [], [], []
        cov_updates = []

        for agent in agents:
            cov = self.compute_cov_for_agent(agent["id"])
            if cov is None:
                insufficient.append(agent["id"])
            elif cov <= threshold:
                autonomous.append({"id": agent["id"], "name": agent["name"], "cov": cov})
                cov_updates.append({"id": agent["id"], "cov": cov})
            else:
                human_driven.append({"id": agent["id"], "name": agent["name"], "cov": cov})
                cov_updates.append({"id": agent["id"], "cov": cov})

        # Batch write CoV scores back to Neo4j
        if cov_updates:
            with self.driver.session() as session:
                session.run(
                    """
                    UNWIND $updates AS row
                    MATCH (a:Agent {id: row.id})
                    SET a.cov_score = row.cov
                    """,
                    updates=cov_updates,
                )

        logger.info(
            f"CoV classification: {len(autonomous)} autonomous, "
            f"{len(human_driven)} human-driven, {len(insufficient)} insufficient data"
        )
        return {
            "autonomous": autonomous,
            "human_driven": human_driven,
            "insufficient_data": insufficient,
        }

    def detect_burst_events(
        self, window_minutes: int = 30, threshold_posts: int = 50
    ) -> list[dict]:
        """
        Detect temporal bursts: windows where post volume exceeds threshold.
        Returns list of burst events with timestamp, agents, and submolts.
        """
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (p:Post)
                RETURN p.agent_id AS agent_id, p.created_at AS created_at,
                       p.submolt AS submolt, p.id AS post_id
                ORDER BY p.created_at
                """
            )
            posts = [dict(r) for r in result]

        if not posts:
            return []

        parsed = []
        for p in posts:
            ts = _parse_dt(p["created_at"])
            if ts:
                parsed.append((ts, p["agent_id"], p["submolt"], p["post_id"]))
        parsed.sort(key=lambda x: x[0])

        window_secs = window_minutes * 60
        bursts = []
        i = 0
        while i < len(parsed):
            window_start = parsed[i][0]
            window_posts = []
            j = i
            while j < len(parsed) and (parsed[j][0] - window_start).total_seconds() <= window_secs:
                window_posts.append(parsed[j])
                j += 1

            if len(window_posts) >= threshold_posts:
                agent_ids = list({p[1] for p in window_posts})
                submolts = list({p[2] for p in window_posts})
                bursts.append(
                    {
                        "start_time": window_start.isoformat(),
                        "end_time": parsed[j - 1][0].isoformat(),
                        "post_count": len(window_posts),
                        "unique_agents": len(agent_ids),
                        "agent_ids": agent_ids[:20],
                        "submolts": submolts[:10],
                        "severity": "HIGH" if len(window_posts) > threshold_posts * 3 else "MEDIUM",
                    }
                )
                i = j
            else:
                i += 1

        logger.info(f"Detected {len(bursts)} burst events")
        return bursts

    def detect_synchronized_posting(
        self, time_tolerance_seconds: int = 60
    ) -> list[dict]:
        """
        Detect groups of agents posting within a tight time window.
        Synchronized posting by diverse owners suggests coordination.
        """
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (p:Post)
                RETURN p.agent_id AS agent_id, p.created_at AS created_at,
                       p.submolt AS submolt, p.id AS post_id
                ORDER BY p.created_at
                """
            )
            posts = [dict(r) for r in result]

        parsed = []
        for p in posts:
            ts = _parse_dt(p["created_at"])
            if ts:
                parsed.append((ts, p["agent_id"], p["submolt"]))
        parsed.sort(key=lambda x: x[0])

        sync_groups = []
        i = 0
        while i < len(parsed):
            group = [parsed[i]]
            j = i + 1
            while j < len(parsed) and (parsed[j][0] - parsed[i][0]).total_seconds() <= time_tolerance_seconds:
                if parsed[j][1] != parsed[i][1]:  # Different agents
                    group.append(parsed[j])
                j += 1

            if len(group) >= 3:  # At least 3 different agents
                agent_ids = list({p[1] for p in group})
                submolts = list({p[2] for p in group})
                if len(agent_ids) >= 3:
                    sync_groups.append(
                        {
                            "window_start": group[0][0].isoformat(),
                            "window_end": group[-1][0].isoformat(),
                            "agent_count": len(agent_ids),
                            "agent_ids": agent_ids,
                            "submolts": submolts,
                            "tolerance_seconds": time_tolerance_seconds,
                        }
                    )
            i = j if j > i + 1 else i + 1

        logger.info(f"Detected {len(sync_groups)} synchronized posting groups")
        return sync_groups

    def compute_heartbeat_fingerprint(self, agent_id: str) -> dict:
        """
        Estimate the heartbeat interval of an OpenClaw agent.
        OpenClaw heartbeats: typically 30min to 4 hours.
        """
        with self.driver.session() as session:
            result = session.run(
                "MATCH (p:Post {agent_id: $id}) "
                "RETURN p.created_at AS ts ORDER BY p.created_at",
                id=agent_id,
            )
            timestamps = [_parse_dt(r["ts"]) for r in result]
            timestamps = [t for t in timestamps if t is not None]

        if len(timestamps) < 5:
            return {
                "agent_id": agent_id,
                "estimated_interval_minutes": None,
                "confidence": "low",
                "is_regular": False,
                "cov": None,
            }

        sorted_ts = sorted(timestamps)
        intervals_secs = [
            (sorted_ts[i + 1] - sorted_ts[i]).total_seconds()
            for i in range(len(sorted_ts) - 1)
        ]
        intervals_secs = [x for x in intervals_secs if x > 0]
        if not intervals_secs:
            return {"agent_id": agent_id, "estimated_interval_minutes": None,
                    "confidence": "low", "is_regular": False, "cov": None}

        # Cast NumPy scalars to native Python types for JSON-safe API responses.
        mean_interval = float(np.mean(intervals_secs))
        std_interval = float(np.std(intervals_secs))
        cov = float(std_interval / mean_interval) if mean_interval > 0 else None

        interval_minutes = mean_interval / 60
        is_regular = bool(cov is not None and cov <= 1.0)
        is_openclaw_range = bool(30 <= interval_minutes <= 240)

        confidence = "high" if (is_regular and is_openclaw_range) else \
                     "medium" if is_regular else "low"

        return {
            "agent_id": agent_id,
            "estimated_interval_minutes": round(interval_minutes, 2),
            "std_interval_minutes": round(std_interval / 60, 2),
            "confidence": confidence,
            "is_regular": is_regular,
            "is_openclaw_range": is_openclaw_range,
            "cov": round(cov, 4) if cov is not None else None,
            "post_count": len(timestamps),
        }
