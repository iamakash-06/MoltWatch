"""
Load pre-existing Moltbook datasets into MoltWatch's SQLite store.
Supports: MoltGraph CSV (arXiv 2603.00646), JSON Lines dumps, and synthetic generation.
"""
import csv
import json
import logging
import random
import math
import string
from pathlib import Path
from datetime import datetime, timedelta, timezone

import numpy as np

from moltwatch.collector.models import Agent, Post, Comment, Interaction, Submolt
from moltwatch.collector.db import SQLiteStore

logger = logging.getLogger(__name__)

# Submolt names for synthetic data — themed like Moltbook's ecosystem
SYNTHETIC_SUBMOLTS = [
    "general", "technology", "science", "philosophy", "creativity",
    "economics", "politics", "culture", "gaming", "worldnews",
    "programming", "machinelearning", "devops", "security", "data",
    "music", "art", "literature", "sports", "environment",
]

SYNTHETIC_PREFIXES = ["agent", "bot", "unit", "node", "proc", "sys", "ai"]
SYNTHETIC_SUFFIXES = list(string.ascii_lowercase) + [str(i) for i in range(100)]


def _random_name(rng: random.Random) -> str:
    prefix = rng.choice(SYNTHETIC_PREFIXES)
    suffix = rng.choice(SYNTHETIC_SUFFIXES)
    num = rng.randint(1, 9999)
    return f"{prefix}_{suffix}{num}"


def _powerlaw_sample(rng: random.Random, xmin: int, alpha: float) -> int:
    u = rng.random()
    return int(xmin * (1 - u) ** (-1 / (alpha - 1)))


class DatasetLoader:
    def __init__(self, store: SQLiteStore):
        self.store = store

    def load_moltgraph(self, data_dir: Path):
        """
        Load MoltGraph CSV files (arXiv 2603.00646).
        Expected files: agents.csv, posts.csv, comments.csv, edges.csv
        """
        data_dir = Path(data_dir)
        loaded = 0

        agents_path = data_dir / "agents.csv"
        if agents_path.exists():
            agents = []
            with open(agents_path, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        agent = Agent(
                            id=row.get("id", row.get("agent_id", row.get("name", ""))),
                            name=row.get("name", row.get("username", "")),
                            display_name=row.get("display_name"),
                            created_at=datetime.fromisoformat(
                                row.get("created_at", "2024-01-01T00:00:00+00:00")
                            ),
                            karma=int(row.get("karma", 0)),
                            post_count=int(row.get("post_count", 0)),
                            comment_count=int(row.get("comment_count", 0)),
                        )
                        agents.append(agent)
                    except Exception as e:
                        logger.warning(f"Skipping agent row: {e}")
            self.store.upsert_agents_batch(agents)
            loaded += len(agents)
            logger.info(f"Loaded {len(agents)} agents from MoltGraph")

        posts_path = data_dir / "posts.csv"
        if posts_path.exists():
            posts = []
            with open(posts_path, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        post = Post(
                            id=row.get("id", row.get("post_id", "")),
                            agent_id=row.get("agent_id", row.get("author_id", "")),
                            submolt=row.get("submolt", row.get("subreddit", "general")),
                            title=row.get("title", ""),
                            body=row.get("body", row.get("selftext")),
                            created_at=datetime.fromisoformat(
                                row.get("created_at", "2024-01-01T00:00:00+00:00")
                            ),
                            upvotes=int(row.get("upvotes", row.get("score", 0))),
                            comment_count=int(row.get("comment_count", row.get("num_comments", 0))),
                        )
                        posts.append(post)
                    except Exception as e:
                        logger.warning(f"Skipping post row: {e}")
            self.store.upsert_posts_batch(posts)
            loaded += len(posts)
            logger.info(f"Loaded {len(posts)} posts from MoltGraph")

        comments_path = data_dir / "comments.csv"
        if comments_path.exists():
            comments = []
            with open(comments_path, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        comment = Comment(
                            id=row.get("id", row.get("comment_id", "")),
                            post_id=row.get("post_id", ""),
                            parent_comment_id=row.get("parent_comment_id") or None,
                            agent_id=row.get("agent_id", row.get("author_id", "")),
                            body=row.get("body", row.get("text", "")),
                            created_at=datetime.fromisoformat(
                                row.get("created_at", "2024-01-01T00:00:00+00:00")
                            ),
                            upvotes=int(row.get("upvotes", 0)),
                            depth=int(row.get("depth", 0)),
                        )
                        comments.append(comment)
                    except Exception as e:
                        logger.warning(f"Skipping comment row: {e}")
            self.store.upsert_comments_batch(comments)
            loaded += len(comments)
            logger.info(f"Loaded {len(comments)} comments from MoltGraph")

        edges_path = data_dir / "edges.csv"
        if edges_path.exists():
            interactions = []
            with open(edges_path, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    try:
                        interaction = Interaction(
                            source_agent_id=row.get("source", row.get("from_agent", "")),
                            target_agent_id=row.get("target", row.get("to_agent", "")),
                            interaction_type=row.get("type", row.get("edge_type", "reply")),
                            post_id=row.get("post_id"),
                            comment_id=row.get("comment_id"),
                            created_at=datetime.fromisoformat(
                                row.get("created_at", "2024-01-01T00:00:00+00:00")
                            ),
                        )
                        interactions.append(interaction)
                    except Exception as e:
                        logger.warning(f"Skipping edge row: {e}")
            self.store.upsert_interactions_batch(interactions)
            loaded += len(interactions)
            logger.info(f"Loaded {len(interactions)} interactions from MoltGraph")

        return loaded

    def load_json_dump(self, json_path: Path):
        """Load from JSON Lines file (one object per line with type field)."""
        json_path = Path(json_path)
        agents, posts, comments, interactions = [], [], [], []

        with open(json_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    t = obj.get("type", "")
                    if t == "agent":
                        agents.append(Agent(**{k: v for k, v in obj.items() if k != "type"}))
                    elif t == "post":
                        posts.append(Post(**{k: v for k, v in obj.items() if k != "type"}))
                    elif t == "comment":
                        comments.append(Comment(**{k: v for k, v in obj.items() if k != "type"}))
                    elif t == "interaction":
                        interactions.append(Interaction(**{k: v for k, v in obj.items() if k != "type"}))
                except Exception as e:
                    logger.warning(f"Skipping JSON line: {e}")

        if agents:
            self.store.upsert_agents_batch(agents)
        if posts:
            self.store.upsert_posts_batch(posts)
        if comments:
            self.store.upsert_comments_batch(comments)
        if interactions:
            self.store.upsert_interactions_batch(interactions)

        total = len(agents) + len(posts) + len(comments) + len(interactions)
        logger.info(f"Loaded {total} records from JSON dump")
        return total

    def generate_synthetic(
        self,
        num_agents: int = 1000,
        num_submolts: int = 20,
        num_posts_per_agent: int = 10,
        num_coordinated_clusters: int = 4,
        cluster_size: int = 15,
        seed: int = 42,
    ) -> dict:
        """
        Generate a synthetic agent social network with known topology parameters:
        - Power-law degree distribution (alpha ~= 2.1)
        - High modularity (Q ~= 0.9) via community-biased posting
        - Injected coordinated clusters for detection testing
        - Mix of autonomous (regular CoV) and human-driven (bursty CoV) agents

        Returns stats dict.
        """
        rng = random.Random(seed)
        np_rng = np.random.default_rng(seed)
        now = datetime.now(timezone.utc)
        start_date = now - timedelta(days=90)

        submolt_names = SYNTHETIC_SUBMOLTS[:num_submolts]

        # Create submolts
        submolts = [
            Submolt(
                name=name,
                description=f"Synthetic submolt: {name}",
                created_at=start_date,
                subscriber_count=rng.randint(50, 5000),
                post_count=0,
            )
            for name in submolt_names
        ]
        for s in submolts:
            self.store.upsert_submolt(s)

        # Assign agents to primary communities (for high modularity)
        num_communities = max(5, num_submolts // 4)
        community_submolts = {}
        for i in range(num_communities):
            community_submolts[i] = submolt_names[
                i * len(submolt_names) // num_communities:
                (i + 1) * len(submolt_names) // num_communities
            ] or [submolt_names[0]]

        agents = []
        agent_community = {}  # agent_id -> community_id

        for i in range(num_agents):
            agent_id = f"agent_{i:05d}"
            community_id = i % num_communities
            agent_community[agent_id] = community_id

            created_at = start_date + timedelta(
                seconds=rng.randint(0, int(timedelta(days=80).total_seconds()))
            )
            agent = Agent(
                id=agent_id,
                name=_random_name(rng),
                display_name=None,
                created_at=created_at,
                karma=max(0, int(np_rng.power(0.3) * 10000)),
                post_count=rng.randint(1, 50),
                comment_count=rng.randint(5, 200),
            )
            agents.append(agent)

        self.store.upsert_agents_batch(agents)

        # Generate posts — agents mostly post in their community's submolts (high modularity)
        posts = []
        post_id_counter = 0
        agent_posts: dict[str, list[str]] = {a.id: [] for a in agents}
        agent_post_times: dict[str, list[datetime]] = {a.id: [] for a in agents}

        for agent in agents:
            community_id = agent_community[agent.id]
            primary_submolts = community_submolts[community_id]

            n_posts = rng.randint(5, num_posts_per_agent * 2)
            # Autonomous agents: regular heartbeat interval
            is_autonomous = rng.random() < 0.7
            if is_autonomous:
                interval_hours = rng.uniform(0.5, 4.0)
                base_time = agent.created_at + timedelta(hours=rng.uniform(0, 24))
            else:
                base_time = agent.created_at + timedelta(hours=rng.uniform(0, 48))

            for j in range(n_posts):
                post_id = f"post_{post_id_counter:07d}"
                post_id_counter += 1

                # 90% in community submolt, 10% cross-community (low external edges)
                if rng.random() < 0.9:
                    submolt = rng.choice(primary_submolts)
                else:
                    submolt = rng.choice(submolt_names)

                if is_autonomous:
                    jitter = timedelta(seconds=rng.gauss(0, interval_hours * 3600 * 0.1))
                    post_time = base_time + timedelta(hours=interval_hours * j) + jitter
                else:
                    # Bursty: exponential inter-arrival times (human-driven)
                    gap_hours = rng.expovariate(1 / 12)
                    base_time = base_time + timedelta(hours=gap_hours)
                    post_time = base_time

                post_time = min(post_time, now)

                post = Post(
                    id=post_id,
                    agent_id=agent.id,
                    submolt=submolt,
                    title=f"Synthetic post {post_id} by {agent.name}",
                    created_at=post_time,
                    upvotes=max(0, int(np_rng.power(0.2) * 1000)),
                    comment_count=rng.randint(0, 20),
                )
                posts.append(post)
                agent_posts[agent.id].append(post_id)
                agent_post_times[agent.id].append(post_time)

        self.store.upsert_posts_batch(posts)

        # Generate reply interactions — mostly within community (power-law recipient selection)
        interactions = []
        all_agent_ids = [a.id for a in agents]

        for agent in agents:
            community_id = agent_community[agent.id]
            community_agents = [
                a.id for a in agents if agent_community[a.id] == community_id and a.id != agent.id
            ]
            if not community_agents:
                continue

            # Number of outgoing replies: power-law distributed
            n_replies = min(_powerlaw_sample(rng, 1, 2.1), 50)
            for _ in range(n_replies):
                # 95% within community, 5% cross-community (for bridge agents)
                if rng.random() < 0.95:
                    target = rng.choice(community_agents)
                else:
                    target = rng.choice(all_agent_ids)
                    while target == agent.id:
                        target = rng.choice(all_agent_ids)

                if agent_post_times[agent.id]:
                    created_at = rng.choice(agent_post_times[agent.id])
                else:
                    created_at = now - timedelta(days=rng.randint(1, 60))

                interactions.append(
                    Interaction(
                        source_agent_id=agent.id,
                        target_agent_id=target,
                        interaction_type="reply",
                        created_at=created_at,
                    )
                )

        # Inject coordinated clusters — synchronized posting, mutual amplification
        coordinated_agent_ids: list[list[str]] = []
        cluster_start_idx = num_agents - (num_coordinated_clusters * cluster_size)
        cluster_start_idx = max(0, cluster_start_idx)

        for c in range(num_coordinated_clusters):
            cluster_agents = agents[
                cluster_start_idx + c * cluster_size:
                cluster_start_idx + (c + 1) * cluster_size
            ]
            cluster_ids = [a.id for a in cluster_agents]
            coordinated_agent_ids.append(cluster_ids)

            # Coordinated agents post simultaneously (tight time windows)
            sync_time = now - timedelta(hours=rng.randint(1, 48))
            cluster_submolt = rng.choice(submolt_names)

            for agent_id in cluster_ids:
                # All cluster agents post within a 60-second window
                jitter_secs = rng.randint(-30, 30)
                post_time = sync_time + timedelta(seconds=jitter_secs)
                post_id = f"post_coord_{c:02d}_{agent_id}"

                coord_post = Post(
                    id=post_id,
                    agent_id=agent_id,
                    submolt=cluster_submolt,
                    title=f"Coordinated post cluster {c}: {cluster_submolt} narrative",
                    created_at=post_time,
                    upvotes=rng.randint(100, 1000),
                    comment_count=rng.randint(5, 30),
                )
                posts.append(coord_post)
                agent_posts[agent_id].append(post_id)
                agent_post_times[agent_id].append(post_time)

                # Mutual amplification: all cluster agents upvote each other
                for other_id in cluster_ids:
                    if other_id != agent_id:
                        interactions.append(
                            Interaction(
                                source_agent_id=agent_id,
                                target_agent_id=other_id,
                                interaction_type="upvote",
                                post_id=post_id,
                                created_at=post_time + timedelta(seconds=rng.randint(1, 300)),
                            )
                        )

        self.store.upsert_posts_batch(posts[-num_coordinated_clusters * cluster_size:])
        self.store.upsert_interactions_batch(interactions)

        stats = self.store.get_stats()
        logger.info(
            f"Generated synthetic network: {stats['agents']} agents, "
            f"{stats['posts']} posts, {stats['interactions']} interactions, "
            f"{num_coordinated_clusters} coordinated clusters injected"
        )
        return {
            **stats,
            "coordinated_clusters": num_coordinated_clusters,
            "cluster_agent_ids": coordinated_agent_ids,
        }
