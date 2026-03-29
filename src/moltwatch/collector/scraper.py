"""
Async Moltbook API scraper — producer-consumer pattern.
Note: The Moltbook API may change post-Meta acquisition (March 10, 2026).
Use dataset_loader.py for static datasets when the live API is unavailable.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from moltwatch.config import settings
from moltwatch.collector.db import SQLiteStore
from moltwatch.collector.models import Agent, Post, Comment, Interaction

logger = logging.getLogger(__name__)

PRIORITY_HIGH = 1
PRIORITY_MEDIUM = 2
PRIORITY_NORMAL = 3


class MoltbookScraper:
    """Concurrent async scraper with producer-consumer pattern."""

    def __init__(self, store: SQLiteStore):
        self.store = store
        self.client: httpx.AsyncClient | None = None
        self.queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self.seen_ids: set[str] = set()
        self._stop = asyncio.Event()

    async def _request(self, path: str, params: dict | None = None) -> dict | None:
        """Make an API request with exponential backoff."""
        assert self.client is not None
        url = settings.moltbook_api_url.rstrip("/") + "/" + path.lstrip("/")
        backoff = 1
        for attempt in range(5):
            try:
                response = await self.client.get(url, params=params)
                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", backoff * 2))
                    logger.warning(f"Rate limited, waiting {retry_after}s")
                    await asyncio.sleep(retry_after)
                    backoff = min(backoff * 2, 60)
                elif response.status_code >= 500:
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 60)
                else:
                    logger.warning(f"HTTP {response.status_code} for {path}")
                    return None
            except (httpx.ConnectError, httpx.TimeoutException) as e:
                logger.warning(f"Request error ({attempt+1}/5): {e}")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)
        return None

    async def discover_posts(self, max_pages: int = 2000):
        """Producer: paginate sort=new, push post IDs to the priority queue."""
        logger.info("Post discovery started")
        limit = 100
        for page in range(max_pages):
            if self._stop.is_set():
                break
            data = await self._request("/posts", {"sort": "new", "limit": limit, "offset": page * limit})
            if not data or not data.get("posts"):
                break

            for post in data["posts"]:
                post_id = str(post.get("id", ""))
                if not post_id or post_id in self.seen_ids:
                    continue
                self.seen_ids.add(post_id)

                # Priority based on activity
                comment_count = post.get("comment_count", 0)
                if comment_count > 100:
                    priority = PRIORITY_HIGH
                elif comment_count > 20:
                    priority = PRIORITY_MEDIUM
                else:
                    priority = PRIORITY_NORMAL

                await self.queue.put((priority, post_id, post))

            await asyncio.sleep(0.1)  # Polite crawl delay

        logger.info(f"Discovery done: {len(self.seen_ids)} posts queued")
        # Signal workers to stop
        for _ in range(20):
            await self.queue.put((99, None, None))

    async def fetch_worker(self, worker_id: int):
        """Consumer: pull from queue, fetch full post + comment tree."""
        while not self._stop.is_set():
            try:
                priority, post_id, post_summary = await asyncio.wait_for(
                    self.queue.get(), timeout=5.0
                )
            except asyncio.TimeoutError:
                continue

            if post_id is None:
                break

            # Fetch full post
            post_data = await self._request(f"/posts/{post_id}")
            if not post_data:
                continue

            await self._process_post(post_data)

            # Fetch comments
            comments_data = await self._request(f"/posts/{post_id}/comments")
            if comments_data:
                await self._process_comments(post_id, comments_data)

    async def _process_post(self, data: dict):
        try:
            agent_data = data.get("author", {})
            agent_id = str(agent_data.get("id", data.get("agent_id", "")))
            agent_name = agent_data.get("name", agent_data.get("username", "unknown"))
            created_raw = data.get("created_at", data.get("created_utc", ""))

            if agent_id:
                agent = Agent(
                    id=agent_id,
                    name=agent_name,
                    created_at=datetime.fromisoformat(created_raw) if created_raw else datetime.now(timezone.utc),
                    karma=int(agent_data.get("karma", 0)),
                    post_count=int(agent_data.get("post_count", 0)),
                    comment_count=int(agent_data.get("comment_count", 0)),
                )
                self.store.upsert_agent(agent)

            post = Post(
                id=str(data["id"]),
                agent_id=agent_id,
                submolt=data.get("submolt", data.get("subreddit", "general")),
                title=data.get("title", ""),
                body=data.get("body", data.get("selftext")),
                created_at=datetime.fromisoformat(created_raw) if created_raw else datetime.now(timezone.utc),
                upvotes=int(data.get("upvotes", data.get("score", 0))),
                comment_count=int(data.get("comment_count", 0)),
            )
            self.store.upsert_post(post, raw_json=data)
        except Exception as e:
            logger.warning(f"Failed to process post: {e}")

    async def _process_comments(self, post_id: str, data: dict):
        comments = data.get("comments", [])
        if not isinstance(comments, list):
            return

        def flatten(comments: list, depth: int = 0) -> list[Comment]:
            result = []
            for c in comments:
                agent_data = c.get("author", {})
                agent_id = str(agent_data.get("id", c.get("agent_id", "")))
                created_raw = c.get("created_at", c.get("created_utc", ""))
                try:
                    comment = Comment(
                        id=str(c["id"]),
                        post_id=post_id,
                        parent_comment_id=str(c.get("parent_id")) if c.get("parent_id") else None,
                        agent_id=agent_id,
                        body=c.get("body", ""),
                        created_at=datetime.fromisoformat(created_raw) if created_raw else datetime.now(timezone.utc),
                        upvotes=int(c.get("upvotes", 0)),
                        depth=depth,
                    )
                    result.append(comment)

                    # Extract reply interaction
                    parent_agent = c.get("parent_author_id")
                    if parent_agent and agent_id:
                        self.store.upsert_interaction(
                            Interaction(
                                source_agent_id=agent_id,
                                target_agent_id=str(parent_agent),
                                interaction_type="reply",
                                post_id=post_id,
                                comment_id=str(c["id"]),
                                created_at=datetime.fromisoformat(created_raw) if created_raw else datetime.now(timezone.utc),
                            )
                        )
                except Exception:
                    pass
                result.extend(flatten(c.get("replies", []), depth + 1))
            return result

        flat_comments = flatten(comments)
        if flat_comments:
            self.store.upsert_comments_batch(flat_comments)

    async def run(self, num_workers: int = 20, max_pages: int = 2000):
        """Main loop: run producer + N consumer workers concurrently."""
        self.client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            headers={"User-Agent": "MoltWatch/1.0 (research)"},
        )
        try:
            producer = asyncio.create_task(self.discover_posts(max_pages=max_pages))
            workers = [
                asyncio.create_task(self.fetch_worker(i))
                for i in range(num_workers)
            ]
            await asyncio.gather(producer, *workers)
        finally:
            await self.client.aclose()
            logger.info(f"Scrape complete. Stats: {self.store.get_stats()}")

    def stop(self):
        self._stop.set()
