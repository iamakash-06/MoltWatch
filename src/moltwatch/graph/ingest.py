"""SQLite → Neo4j ETL pipeline using UNWIND batches for performance."""
import logging
from neo4j import Driver

from moltwatch.collector.db import SQLiteStore

logger = logging.getLogger(__name__)


class Neo4jIngestor:
    def __init__(self, driver: Driver, store: SQLiteStore):
        self.driver = driver
        self.store = store

    def ingest_submolts(self, batch_size: int = 1000):
        total = 0
        for batch in self.store.iter_submolts(batch_size):
            with self.driver.session() as session:
                session.run(
                    """
                    UNWIND $batch AS row
                    MERGE (s:Submolt {name: row.name})
                    ON CREATE SET s.description = row.description,
                                  s.created_at = row.created_at,
                                  s.subscriber_count = row.subscriber_count,
                                  s.post_count = row.post_count
                    ON MATCH SET s.subscriber_count = row.subscriber_count,
                                 s.post_count = row.post_count
                    """,
                    batch=batch,
                )
            total += len(batch)
        logger.info(f"Ingested {total} submolts")
        return total

    def ingest_agents(self, batch_size: int = 5000):
        total = 0
        for batch in self.store.iter_agents(batch_size):
            with self.driver.session() as session:
                session.run(
                    """
                    UNWIND $batch AS row
                    MERGE (a:Agent {id: row.id})
                    ON CREATE SET a.name = row.name,
                                  a.display_name = row.display_name,
                                  a.created_at = row.created_at,
                                  a.karma = row.karma,
                                  a.post_count = row.post_count,
                                  a.comment_count = row.comment_count,
                                  a.first_seen = row.first_seen
                    ON MATCH SET a.karma = row.karma,
                                 a.post_count = row.post_count,
                                 a.comment_count = row.comment_count,
                                 a.last_seen = row.last_seen
                    """,
                    batch=batch,
                )
            total += len(batch)
        logger.info(f"Ingested {total} agents")
        return total

    def ingest_posts(self, batch_size: int = 5000):
        """Ingest posts as :Post nodes and create POSTED_IN edges to :Submolt."""
        total = 0
        for batch in self.store.iter_posts(batch_size):
            with self.driver.session() as session:
                session.run(
                    """
                    UNWIND $batch AS row
                    MERGE (p:Post {id: row.id})
                    ON CREATE SET p.agent_id = row.agent_id,
                                  p.submolt = row.submolt,
                                  p.title = row.title,
                                  p.created_at = row.created_at,
                                  p.upvotes = row.upvotes,
                                  p.comment_count = row.comment_count
                    ON MATCH SET p.upvotes = row.upvotes,
                                 p.comment_count = row.comment_count
                    WITH p, row
                    MATCH (a:Agent {id: row.agent_id})
                    MATCH (s:Submolt {name: row.submolt})
                    MERGE (a)-[:POSTED_IN {post_id: p.id, created_at: row.created_at}]->(s)
                    """,
                    batch=batch,
                )
            total += len(batch)
        logger.info(f"Ingested {total} posts")
        return total

    def ingest_interactions(self, batch_size: int = 10000):
        """Load interactions as typed edges between Agent nodes.

        Uses MERGE on the agent-pair only (no nullable properties in the key),
        then increments a weight counter. This produces weighted edges that are
        better suited for GDS algorithms and avoids null-property MERGE errors.
        """
        total = 0
        for batch in self.store.iter_interactions(batch_size):
            reply_batch = [r for r in batch if r["interaction_type"] == "reply"]
            upvote_batch = [r for r in batch if r["interaction_type"] == "upvote"]
            other_batch = [r for r in batch if r["interaction_type"] not in ("reply", "upvote")]

            with self.driver.session() as session:
                if reply_batch:
                    session.run(
                        """
                        UNWIND $batch AS row
                        MATCH (a:Agent {id: row.source_agent_id})
                        MATCH (b:Agent {id: row.target_agent_id})
                        MERGE (a)-[r:REPLIED_TO]->(b)
                        ON CREATE SET r.weight = 1,
                                      r.first_post_id = row.post_id,
                                      r.first_at = row.created_at
                        ON MATCH  SET r.weight = coalesce(r.weight, 0) + 1,
                                      r.last_at = row.created_at
                        """,
                        batch=reply_batch,
                    )
                if upvote_batch:
                    session.run(
                        """
                        UNWIND $batch AS row
                        MATCH (a:Agent {id: row.source_agent_id})
                        MATCH (b:Agent {id: row.target_agent_id})
                        MERGE (a)-[r:UPVOTED]->(b)
                        ON CREATE SET r.weight = 1,
                                      r.first_post_id = row.post_id,
                                      r.first_at = row.created_at
                        ON MATCH  SET r.weight = coalesce(r.weight, 0) + 1,
                                      r.last_at = row.created_at
                        """,
                        batch=upvote_batch,
                    )
                if other_batch:
                    session.run(
                        """
                        UNWIND $batch AS row
                        MATCH (a:Agent {id: row.source_agent_id})
                        MATCH (b:Agent {id: row.target_agent_id})
                        MERGE (a)-[r:INTERACTED {type: row.interaction_type}]->(b)
                        ON CREATE SET r.weight = 1,
                                      r.first_at = row.created_at
                        ON MATCH  SET r.weight = coalesce(r.weight, 0) + 1,
                                      r.last_at = row.created_at
                        """,
                        batch=other_batch,
                    )
            total += len(batch)
        logger.info(f"Ingested {total} interactions")
        return total

    def build_co_activity_edges(self, min_shared_submolts: int = 2):
        """
        Create CO_ACTIVE_WITH edges for agents active in the same submolts.
        Agents sharing >= min_shared_submolts submolts get a weighted edge.
        """
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (a:Agent)-[:POSTED_IN]->(s:Submolt)<-[:POSTED_IN]-(b:Agent)
                WHERE a.id < b.id
                WITH a, b, count(DISTINCT s) AS shared, collect(DISTINCT s.name) AS submolts
                WHERE shared >= $min_shared
                MERGE (a)-[r:CO_ACTIVE_WITH]->(b)
                SET r.count = shared, r.submolts = submolts
                RETURN count(*) AS edges_created
                """,
                min_shared=min_shared_submolts,
            )
            row = result.single()
            count = row["edges_created"] if row else 0
        logger.info(f"Built {count} CO_ACTIVE_WITH edges")
        return count

    def run_full_ingest(self):
        """Complete ETL: submolts → agents → posts → interactions → co-activity."""
        stats = {}
        stats["submolts"] = self.ingest_submolts()
        stats["agents"] = self.ingest_agents()
        stats["posts"] = self.ingest_posts()
        stats["interactions"] = self.ingest_interactions()
        stats["co_activity_edges"] = self.build_co_activity_edges()
        logger.info(f"Full ingest complete: {stats}")
        return stats
