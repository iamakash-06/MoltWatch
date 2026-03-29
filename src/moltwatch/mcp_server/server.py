"""
MoltWatch MCP Server — exposes SNA threat intelligence as conversational tools.
Uses FastMCP (consistent with other Akash projects).

Transport: stdio (default, for Claude Desktop) or SSE (for web clients).
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator

from mcp.server.fastmcp import FastMCP

logger = logging.getLogger(__name__)


@dataclass
class MoltWatchContext:
    driver: object
    gds: object


@asynccontextmanager
async def moltwatch_lifespan(server: FastMCP) -> AsyncIterator[MoltWatchContext]:
    from moltwatch.graph.connection import get_driver, get_gds
    from moltwatch.graph.schema import setup_schema

    driver = get_driver()
    gds = get_gds()
    setup_schema(driver)
    logger.info("MoltWatch MCP server started, Neo4j connected")
    try:
        yield MoltWatchContext(driver=driver, gds=gds)
    finally:
        driver.close()
        logger.info("MoltWatch MCP server stopped")


def _make_mcp() -> FastMCP:
    """Build the FastMCP instance, using env vars so SSE host/port are set before tools load."""
    transport = os.getenv("TRANSPORT", "stdio")
    if transport == "sse":
        return FastMCP(
            "moltwatch",
            instructions=(
                "Agent Network Threat Intelligence — SNA-based security analysis for AI social networks. "
                "Detects coordinated manipulation, prompt injection propagation, and rogue agent clusters "
                "in Moltbook's 1.5M+ agent ecosystem using Social Network Analysis."
            ),
            host=os.getenv("HOST", "0.0.0.0"),
            port=int(os.getenv("PORT", "8051")),
            lifespan=moltwatch_lifespan,
        )
    return FastMCP(
        "moltwatch",
        instructions=(
            "Agent Network Threat Intelligence — SNA-based security analysis for AI social networks. "
            "Detects coordinated manipulation, prompt injection propagation, and rogue agent clusters "
            "in Moltbook's 1.5M+ agent ecosystem using Social Network Analysis."
        ),
        lifespan=moltwatch_lifespan,
    )


mcp = _make_mcp()

# Import tools to register them with the server
from moltwatch.mcp_server import tools  # noqa: E402, F401


def main():
    transport = os.getenv("TRANSPORT", "stdio")
    if transport == "sse":
        asyncio.run(mcp.run_sse_async())
    else:
        asyncio.run(mcp.run_stdio_async())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
