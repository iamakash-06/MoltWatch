"""Tests for collector layer: SQLite storage."""
import tempfile
import pytest
from pathlib import Path
from datetime import datetime, timezone

from moltwatch.collector.models import Agent, Post, Comment, Interaction
from moltwatch.collector.db import SQLiteStore


@pytest.fixture
def store():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = Path(f.name)
    s = SQLiteStore(db_path)
    yield s
    db_path.unlink(missing_ok=True)


def make_agent(id: str, name: str | None = None) -> Agent:
    return Agent(
        id=id,
        name=name or f"agent_{id}",
        created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
        karma=100,
        post_count=10,
        comment_count=50,
    )


def make_post(id: str, agent_id: str, submolt: str = "general") -> Post:
    return Post(
        id=id,
        agent_id=agent_id,
        submolt=submolt,
        title=f"Test post {id}",
        created_at=datetime(2024, 6, 1, tzinfo=timezone.utc),
        upvotes=5,
        comment_count=2,
    )


def test_upsert_agent(store):
    agent = make_agent("a1")
    store.upsert_agent(agent)
    assert store.get_agent_count() == 1


def test_upsert_agent_updates(store):
    agent = make_agent("a1")
    store.upsert_agent(agent)
    # Update karma
    updated = make_agent("a1")
    updated.karma = 9999
    store.upsert_agent(updated)
    assert store.get_agent_count() == 1  # Still one agent


def test_upsert_agents_batch(store):
    agents = [make_agent(f"a{i}") for i in range(100)]
    store.upsert_agents_batch(agents)
    assert store.get_agent_count() == 100


def test_upsert_post(store):
    store.upsert_agent(make_agent("a1"))
    store.upsert_post(make_post("p1", "a1"))
    assert store.get_post_count() == 1


def test_upsert_interaction(store):
    store.upsert_agents_batch([make_agent("a1"), make_agent("a2")])
    interaction = Interaction(
        source_agent_id="a1",
        target_agent_id="a2",
        interaction_type="reply",
        created_at=datetime(2024, 6, 1, tzinfo=timezone.utc),
    )
    store.upsert_interaction(interaction)
    assert store.get_interaction_count() == 1


def test_iter_agents(store):
    agents = [make_agent(f"a{i}") for i in range(50)]
    store.upsert_agents_batch(agents)
    total = sum(len(batch) for batch in store.iter_agents(batch_size=10))
    assert total == 50


def test_get_stats(store):
    store.upsert_agents_batch([make_agent("a1"), make_agent("a2")])
    store.upsert_post(make_post("p1", "a1"))
    stats = store.get_stats()
    assert stats["agents"] == 2
    assert stats["posts"] == 1
    assert stats["comments"] == 0

