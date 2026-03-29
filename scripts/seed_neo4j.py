#!/usr/bin/env python3
"""
Seed Neo4j with agent social network data.

Usage:
    python scripts/seed_neo4j.py --dataset synthetic
    python scripts/seed_neo4j.py --dataset moltgraph --data-dir ./data/moltgraph
    python scripts/seed_neo4j.py --dataset json --json-path ./data/dump.jsonl
"""
import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from moltwatch.config import settings
from moltwatch.collector.db import SQLiteStore
from moltwatch.collector.dataset_loader import DatasetLoader
from moltwatch.graph.connection import get_driver, get_gds
from moltwatch.graph.schema import setup_schema
from moltwatch.graph.ingest import Neo4jIngestor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("seed_neo4j")


def main():
    parser = argparse.ArgumentParser(description="Seed MoltWatch Neo4j database")
    parser.add_argument(
        "--dataset",
        choices=["synthetic", "moltgraph", "json"],
        default="synthetic",
        help="Dataset to load",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("data/moltgraph"),
        help="Directory containing MoltGraph CSV files",
    )
    parser.add_argument(
        "--json-path",
        type=Path,
        default=Path("data/dump.jsonl"),
        help="JSON Lines dump file path",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=settings.db_path,
        help="SQLite database path",
    )
    parser.add_argument(
        "--num-agents",
        type=int,
        default=1000,
        help="Number of agents for synthetic dataset",
    )
    parser.add_argument(
        "--skip-ingest",
        action="store_true",
        help="Skip Neo4j ingest (SQLite only)",
    )
    args = parser.parse_args()

    # Step 1: Load data into SQLite
    logger.info(f"Loading dataset: {args.dataset}")
    store = SQLiteStore(args.db_path)
    loader = DatasetLoader(store)

    if args.dataset == "synthetic":
        result = loader.generate_synthetic(num_agents=args.num_agents)
        logger.info(f"Synthetic data generated: {result}")
    elif args.dataset == "moltgraph":
        count = loader.load_moltgraph(args.data_dir)
        logger.info(f"MoltGraph loaded: {count} records")
    elif args.dataset == "json":
        count = loader.load_json_dump(args.json_path)
        logger.info(f"JSON dump loaded: {count} records")

    sqlite_stats = store.get_stats()
    logger.info(f"SQLite stats: {sqlite_stats}")

    if args.skip_ingest:
        logger.info("Skipping Neo4j ingest (--skip-ingest flag set)")
        return

    # Step 2: Set up Neo4j schema
    logger.info("Connecting to Neo4j...")
    driver = get_driver()
    setup_schema(driver)

    # Step 3: Ingest SQLite → Neo4j
    logger.info("Running ETL: SQLite → Neo4j")
    ingestor = Neo4jIngestor(driver, store)
    neo4j_stats = ingestor.run_full_ingest()
    logger.info(f"Neo4j ingest complete: {neo4j_stats}")

    # Step 4: Verify
    with driver.session() as session:
        result = session.run("MATCH (a:Agent) RETURN count(a) AS count")
        count = result.single()["count"]
    logger.info(f"Neo4j agent count: {count}")
    logger.info("Seed complete! Open http://localhost:7474 to explore the graph.")


if __name__ == "__main__":
    main()
