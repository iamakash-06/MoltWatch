"""FastAPI application — REST layer for the React dashboard."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from moltwatch.api.routes import graph, analysis, threats, agents, search

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from moltwatch.graph.connection import get_driver, get_gds
    from moltwatch.graph.schema import setup_schema

    driver = get_driver()
    gds = get_gds()
    setup_schema(driver)
    app.state.driver = driver
    app.state.gds = gds
    logger.info("MoltWatch API started, Neo4j connected")
    yield
    driver.close()
    logger.info("MoltWatch API stopped")


app = FastAPI(
    title="MoltWatch API",
    description="Agent Network Threat Intelligence REST API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graph.router, prefix="/api/graph", tags=["graph"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
app.include_router(threats.router, prefix="/api/threats", tags=["threats"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(search.router, prefix="/api/search", tags=["search"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "moltwatch-api"}


def main():
    import uvicorn
    uvicorn.run("moltwatch.api.main:app", host="0.0.0.0", port=8000, reload=True)
