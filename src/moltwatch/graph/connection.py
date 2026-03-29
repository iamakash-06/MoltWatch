"""Neo4j driver and GDS client singletons."""
import logging
from functools import lru_cache

from neo4j import GraphDatabase, Driver
from graphdatascience import GraphDataScience

from moltwatch.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_driver() -> Driver:
    driver = GraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
    )
    driver.verify_connectivity()
    logger.info(f"Connected to Neo4j at {settings.neo4j_uri}")
    return driver


@lru_cache(maxsize=1)
def get_gds() -> GraphDataScience:
    gds = GraphDataScience(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
    )
    logger.info("GDS client initialized")
    return gds


def close_connections():
    driver = get_driver.__wrapped__() if hasattr(get_driver, "__wrapped__") else None
    if driver:
        driver.close()
    get_driver.cache_clear()
    get_gds.cache_clear()
