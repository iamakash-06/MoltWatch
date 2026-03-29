"""Tests for analysis functions that don't require Neo4j."""
import pytest
from datetime import datetime, timezone, timedelta

from moltwatch.analysis.temporal import _compute_cov, _parse_dt


def make_timestamps(interval_seconds: float, count: int, jitter: float = 0.0) -> list[datetime]:
    """Generate regular timestamps with optional jitter."""
    import random
    rng = random.Random(42)
    base = datetime(2024, 1, 1, tzinfo=timezone.utc)
    timestamps = []
    t = base
    for _ in range(count):
        if jitter > 0:
            t += timedelta(seconds=interval_seconds + rng.gauss(0, jitter))
        else:
            t += timedelta(seconds=interval_seconds)
        timestamps.append(t)
    return timestamps


def test_cov_regular_posting():
    """Autonomous agent with regular 1-hour intervals → CoV ≈ 0."""
    ts = make_timestamps(3600, 20)
    cov = _compute_cov(ts)
    assert cov is not None
    assert cov < 0.2  # Near-zero CoV for regular posting


def test_cov_bursty_posting():
    """Human-driven agent with exponential inter-arrivals → CoV > 1."""
    import random
    rng = random.Random(99)
    base = datetime(2024, 1, 1, tzinfo=timezone.utc)
    ts = [base + timedelta(seconds=sum(rng.expovariate(1/3600) for _ in range(i+1)))
          for i in range(20)]
    cov = _compute_cov(ts)
    # Exponential distribution has CoV = 1; with randomness it should be > 0.7
    assert cov is not None
    assert cov > 0.5


def test_cov_insufficient_data():
    """Fewer than 5 timestamps → None."""
    ts = make_timestamps(3600, 3)
    assert _compute_cov(ts) is None


def test_cov_single_timestamp():
    ts = make_timestamps(3600, 1)
    assert _compute_cov(ts) is None


def test_parse_dt_iso():
    ts = _parse_dt("2024-06-01T12:00:00+00:00")
    assert ts is not None
    assert ts.tzinfo is not None


def test_parse_dt_none():
    assert _parse_dt(None) is None


def test_parse_dt_invalid():
    assert _parse_dt("not-a-date") is None


def test_gini_perfect_equality():
    """All agents have same karma → Gini = 0."""
    values = [100] * 100
    n = len(values)
    total = sum(values)
    weighted_sum = sum((i + 1) * x for i, x in enumerate(sorted(values)))
    gini = (2 * weighted_sum) / (n * total) - (n + 1) / n
    assert abs(gini) < 0.01


def test_gini_perfect_inequality():
    """One agent has all karma → Gini ≈ 1."""
    values = [0] * 99 + [1000000]
    n = len(values)
    total = sum(values)
    weighted_sum = sum((i + 1) * x for i, x in enumerate(sorted(values)))
    gini = (2 * weighted_sum) / (n * total) - (n + 1) / n
    assert gini > 0.98
