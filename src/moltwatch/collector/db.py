import sqlite3
import json
import logging
from pathlib import Path
from datetime import datetime, timezone
from contextlib import contextmanager

from moltwatch.collector.models import Agent, Post, Comment, Interaction, Submolt

logger = logging.getLogger(__name__)

SCHEMA_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL,
    karma INTEGER DEFAULT 0,
    post_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    raw_json TEXT,
    first_seen TEXT,
    last_seen TEXT
);

CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    submolt TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    created_at TEXT NOT NULL,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    fetched_comment_count INTEGER DEFAULT 0,
    raw_json TEXT,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    parent_comment_id TEXT,
    agent_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    upvotes INTEGER DEFAULT 0,
    depth INTEGER DEFAULT 0,
    raw_json TEXT,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_agent_id TEXT NOT NULL,
    target_agent_id TEXT NOT NULL,
    interaction_type TEXT NOT NULL,
    post_id TEXT,
    comment_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_agent_id) REFERENCES agents(id),
    FOREIGN KEY (target_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS submolts (
    name TEXT PRIMARY KEY,
    description TEXT,
    created_at TEXT,
    subscriber_count INTEGER DEFAULT 0,
    post_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_posts_agent ON posts(agent_id);
CREATE INDEX IF NOT EXISTS idx_posts_submolt ON posts(submolt);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_agent ON comments(agent_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_interactions_source ON interactions(source_agent_id);
CREATE INDEX IF NOT EXISTS idx_interactions_target ON interactions(target_agent_id);
CREATE INDEX IF NOT EXISTS idx_interactions_created ON interactions(created_at);
"""


class SQLiteStore:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        with self._conn() as conn:
            conn.executescript(SCHEMA_SQL)

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(str(self.db_path), timeout=30)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def upsert_agent(self, agent: Agent, raw_json: dict | None = None):
        now = self._now()
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO agents (id, name, display_name, created_at, karma,
                    post_count, comment_count, raw_json, first_seen, last_seen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    karma = excluded.karma,
                    post_count = excluded.post_count,
                    comment_count = excluded.comment_count,
                    raw_json = excluded.raw_json,
                    last_seen = excluded.last_seen
                """,
                (
                    agent.id, agent.name, agent.display_name,
                    agent.created_at.isoformat(), agent.karma,
                    agent.post_count, agent.comment_count,
                    json.dumps(raw_json) if raw_json else None,
                    now, now,
                ),
            )

    def upsert_agents_batch(self, agents: list[Agent]):
        now = self._now()
        with self._conn() as conn:
            conn.executemany(
                """
                INSERT INTO agents (id, name, display_name, created_at, karma,
                    post_count, comment_count, first_seen, last_seen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    karma = excluded.karma,
                    post_count = excluded.post_count,
                    comment_count = excluded.comment_count,
                    last_seen = excluded.last_seen
                """,
                [
                    (a.id, a.name, a.display_name, a.created_at.isoformat(),
                     a.karma, a.post_count, a.comment_count, now, now)
                    for a in agents
                ],
            )

    def upsert_post(self, post: Post, raw_json: dict | None = None):
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO posts (id, agent_id, submolt, title, body, created_at,
                    upvotes, downvotes, comment_count, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    upvotes = excluded.upvotes,
                    downvotes = excluded.downvotes,
                    comment_count = excluded.comment_count,
                    raw_json = excluded.raw_json
                """,
                (
                    post.id, post.agent_id, post.submolt, post.title, post.body,
                    post.created_at.isoformat(), post.upvotes, post.downvotes,
                    post.comment_count, json.dumps(raw_json) if raw_json else None,
                ),
            )

    def upsert_posts_batch(self, posts: list[Post]):
        with self._conn() as conn:
            conn.executemany(
                """
                INSERT INTO posts (id, agent_id, submolt, title, body, created_at,
                    upvotes, downvotes, comment_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    upvotes = excluded.upvotes,
                    downvotes = excluded.downvotes,
                    comment_count = excluded.comment_count
                """,
                [
                    (p.id, p.agent_id, p.submolt, p.title, p.body,
                     p.created_at.isoformat(), p.upvotes, p.downvotes, p.comment_count)
                    for p in posts
                ],
            )

    def upsert_comment(self, comment: Comment, raw_json: dict | None = None):
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO comments (id, post_id, parent_comment_id, agent_id, body,
                    created_at, upvotes, depth, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    upvotes = excluded.upvotes,
                    raw_json = excluded.raw_json
                """,
                (
                    comment.id, comment.post_id, comment.parent_comment_id,
                    comment.agent_id, comment.body, comment.created_at.isoformat(),
                    comment.upvotes, comment.depth,
                    json.dumps(raw_json) if raw_json else None,
                ),
            )

    def upsert_comments_batch(self, comments: list[Comment]):
        with self._conn() as conn:
            conn.executemany(
                """
                INSERT INTO comments (id, post_id, parent_comment_id, agent_id, body,
                    created_at, upvotes, depth)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET upvotes = excluded.upvotes
                """,
                [
                    (c.id, c.post_id, c.parent_comment_id, c.agent_id, c.body,
                     c.created_at.isoformat(), c.upvotes, c.depth)
                    for c in comments
                ],
            )

    def upsert_interaction(self, interaction: Interaction):
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO interactions
                    (source_agent_id, target_agent_id, interaction_type, post_id, comment_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    interaction.source_agent_id, interaction.target_agent_id,
                    interaction.interaction_type, interaction.post_id,
                    interaction.comment_id, interaction.created_at.isoformat(),
                ),
            )

    def upsert_interactions_batch(self, interactions: list[Interaction]):
        with self._conn() as conn:
            conn.executemany(
                """
                INSERT INTO interactions
                    (source_agent_id, target_agent_id, interaction_type, post_id, comment_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    (i.source_agent_id, i.target_agent_id, i.interaction_type,
                     i.post_id, i.comment_id, i.created_at.isoformat())
                    for i in interactions
                ],
            )

    def upsert_submolt(self, submolt: Submolt):
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO submolts (name, description, created_at, subscriber_count, post_count)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    subscriber_count = excluded.subscriber_count,
                    post_count = excluded.post_count
                """,
                (submolt.name, submolt.description,
                 submolt.created_at.isoformat() if submolt.created_at else None,
                 submolt.subscriber_count, submolt.post_count),
            )

    def get_all_agent_ids(self) -> list[str]:
        with self._conn() as conn:
            rows = conn.execute("SELECT id FROM agents").fetchall()
            return [r["id"] for r in rows]

    def get_agent_count(self) -> int:
        with self._conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM agents").fetchone()[0]

    def get_post_count(self) -> int:
        with self._conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0]

    def get_comment_count(self) -> int:
        with self._conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM comments").fetchone()[0]

    def get_interaction_count(self) -> int:
        with self._conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM interactions").fetchone()[0]

    def iter_agents(self, batch_size: int = 5000):
        with self._conn() as conn:
            offset = 0
            while True:
                rows = conn.execute(
                    "SELECT * FROM agents LIMIT ? OFFSET ?", (batch_size, offset)
                ).fetchall()
                if not rows:
                    break
                yield [dict(r) for r in rows]
                offset += batch_size

    def iter_interactions(self, batch_size: int = 10000):
        with self._conn() as conn:
            offset = 0
            while True:
                rows = conn.execute(
                    "SELECT * FROM interactions LIMIT ? OFFSET ?", (batch_size, offset)
                ).fetchall()
                if not rows:
                    break
                yield [dict(r) for r in rows]
                offset += batch_size

    def iter_posts(self, batch_size: int = 5000):
        with self._conn() as conn:
            offset = 0
            while True:
                rows = conn.execute(
                    "SELECT * FROM posts LIMIT ? OFFSET ?", (batch_size, offset)
                ).fetchall()
                if not rows:
                    break
                yield [dict(r) for r in rows]
                offset += batch_size

    def iter_submolts(self, batch_size: int = 1000):
        with self._conn() as conn:
            offset = 0
            while True:
                rows = conn.execute(
                    "SELECT * FROM submolts LIMIT ? OFFSET ?", (batch_size, offset)
                ).fetchall()
                if not rows:
                    break
                yield [dict(r) for r in rows]
                offset += batch_size

    def get_stats(self) -> dict:
        return {
            "agents": self.get_agent_count(),
            "posts": self.get_post_count(),
            "comments": self.get_comment_count(),
            "interactions": self.get_interaction_count(),
        }
