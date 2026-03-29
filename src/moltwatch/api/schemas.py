"""Pydantic response models for the REST API."""
from pydantic import BaseModel
from typing import Any


class NetworkOverview(BaseModel):
    agents: int
    submolts: int
    reply_edges: int
    community_count: int
    modularity: float
    gini_karma: float
    gini_pagerank: float


class AgentNode(BaseModel):
    id: str
    name: str
    karma: int | None = None
    pagerank: float | None = None
    community_id: int | None = None
    trust_score: float | None = None
    hub_score: float | None = None
    authority_score: float | None = None


class GraphEdge(BaseModel):
    source: str
    target: str
    weight: int = 1


class GraphData(BaseModel):
    nodes: list[AgentNode]
    edges: list[GraphEdge]


class CommunityItem(BaseModel):
    community_id: int
    member_count: int


class ThreatItem(BaseModel):
    id: str | None = None
    threat_type: str
    severity: str
    agent_ids: list[str]
    description: str
    evidence: dict[str, Any] = {}


class AgentProfile(BaseModel):
    id: str
    name: str
    karma: int | None = None
    pagerank: float | None = None
    community_id: int | None = None
    trust_score: float | None = None
    cov_score: float | None = None
    hub_score: float | None = None
    authority_score: float | None = None
    out_degree: int | None = None
    in_degree: int | None = None
    submolts: list[str] = []
    created_at: str | None = None


class SearchResult(BaseModel):
    agents: list[AgentNode]
    total: int


class PaginatedResponse(BaseModel):
    items: list[Any]
    total: int | None = None
    limit: int
    offset: int
