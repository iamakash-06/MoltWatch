"""Neo4j schema: constraints and indexes."""
import logging
from neo4j import Driver

logger = logging.getLogger(__name__)

CONSTRAINTS = [
    "CREATE CONSTRAINT agent_id IF NOT EXISTS FOR (a:Agent) REQUIRE a.id IS UNIQUE",
    "CREATE CONSTRAINT submolt_name IF NOT EXISTS FOR (s:Submolt) REQUIRE s.name IS UNIQUE",
    "CREATE CONSTRAINT post_id IF NOT EXISTS FOR (p:Post) REQUIRE p.id IS UNIQUE",
]

INDEXES = [
    "CREATE INDEX agent_name IF NOT EXISTS FOR (a:Agent) ON (a.name)",
    "CREATE INDEX agent_community IF NOT EXISTS FOR (a:Agent) ON (a.community_id)",
    "CREATE INDEX agent_created IF NOT EXISTS FOR (a:Agent) ON (a.created_at)",
    "CREATE INDEX agent_trust IF NOT EXISTS FOR (a:Agent) ON (a.trust_score)",
    "CREATE INDEX agent_pagerank IF NOT EXISTS FOR (a:Agent) ON (a.pagerank)",
]


def setup_schema(driver: Driver):
    with driver.session() as session:
        for stmt in CONSTRAINTS + INDEXES:
            try:
                session.run(stmt)
            except Exception as e:
                logger.warning(f"Schema statement skipped ({e}): {stmt[:60]}")
    logger.info("Neo4j schema ready")
