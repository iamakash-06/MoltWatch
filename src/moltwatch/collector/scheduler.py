"""
APScheduler-based periodic collection and analysis pipeline.
"""
import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from moltwatch.config import settings
from moltwatch.collector.db import SQLiteStore

logger = logging.getLogger(__name__)


async def _run_scrape(db_path=None):
    """Scrape latest posts from Moltbook API."""
    from moltwatch.collector.scraper import MoltbookScraper
    store = SQLiteStore(db_path or settings.db_path)
    scraper = MoltbookScraper(store)
    try:
        await scraper.run(num_workers=10, max_pages=100)
    except Exception as e:
        logger.error(f"Scrape failed: {e}")


async def _run_analysis():
    """Run analysis pipeline: centrality, community, CoV, trust."""
    from moltwatch.graph.connection import get_driver, get_gds
    from moltwatch.analysis.centrality import CentralityAnalyzer
    from moltwatch.analysis.community import CommunityAnalyzer
    from moltwatch.analysis.temporal import TemporalAnalyzer
    from moltwatch.analysis.trust import TrustScorer, set_flagged_agents
    from moltwatch.analysis.anomaly import AnomalyDetector

    try:
        driver = get_driver()
        gds = get_gds()

        centrality = CentralityAnalyzer(driver, gds)
        centrality.run_pagerank()

        community = CommunityAnalyzer(driver, gds)
        community.run_louvain()

        temporal = TemporalAnalyzer(driver)
        temporal.classify_agents_by_cov()

        anomaly = AnomalyDetector(driver)
        clusters = anomaly.detect_coordinated_clusters(min_cluster_size=3)
        flagged = [aid for c in clusters for aid in c.get("agent_ids", [])]
        set_flagged_agents(flagged)

        trust = TrustScorer(driver)
        trust.compute_all_trust_scores()

        logger.info("Scheduled analysis pipeline complete")
    except Exception as e:
        logger.error(f"Analysis pipeline failed: {e}")


def create_scheduler(
    collection_interval_minutes: int | None = None,
    analysis_interval_minutes: int = 60,
) -> AsyncIOScheduler:
    """Create and configure the APScheduler instance."""
    scheduler = AsyncIOScheduler()
    interval = collection_interval_minutes or settings.collection_interval_minutes

    scheduler.add_job(
        _run_scrape,
        trigger=IntervalTrigger(minutes=interval),
        id="scrape",
        name="Moltbook scraper",
        replace_existing=True,
    )

    scheduler.add_job(
        _run_analysis,
        trigger=IntervalTrigger(minutes=analysis_interval_minutes),
        id="analysis",
        name="Analysis pipeline",
        replace_existing=True,
    )

    logger.info(
        f"Scheduler configured: scrape every {interval}min, analysis every {analysis_interval_minutes}min"
    )
    return scheduler
