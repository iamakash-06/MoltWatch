"""Graph data endpoints — nodes, edges, subgraphs for Sigma.js visualization."""
from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/overview")
async def get_overview(request: Request):
    driver = request.app.state.driver
    gds = request.app.state.gds

    from moltwatch.analysis.centrality import CentralityAnalyzer
    from moltwatch.analysis.community import CommunityAnalyzer

    centrality = CentralityAnalyzer(driver, gds)
    community = CommunityAnalyzer(driver, gds)

    with driver.session() as session:
        result = session.run(
            """
            MATCH (a:Agent) WITH count(a) AS agents
            MATCH (s:Submolt) WITH agents, count(s) AS submolts
            OPTIONAL MATCH ()-[r:REPLIED_TO]->()
            RETURN agents, submolts, count(r) AS reply_edges
            """
        ).single()
        base = dict(result) if result else {}

    communities = community.get_all_communities()
    modularity = community.compute_modularity()
    karma_gini = centrality.compute_gini_coefficient("karma")
    pagerank_gini = centrality.compute_gini_coefficient("pagerank")

    return {
        **base,
        "community_count": len(communities),
        "modularity": modularity,
        "gini_karma": karma_gini,
        "gini_pagerank": pagerank_gini,
    }


@router.get("/nodes")
async def get_nodes(
    request: Request,
    limit: int = Query(1000, le=5000),
    offset: int = Query(0),
    community_id: int | None = Query(None),
):
    driver = request.app.state.driver
    with driver.session() as session:
        result = session.run(
            """
            MATCH (a:Agent)
            WHERE $community_id IS NULL OR a.community_id = $community_id
            RETURN a.id AS id, a.name AS name, a.karma AS karma,
                   a.pagerank AS pagerank, a.community_id AS community_id,
                   a.trust_score AS trust_score, a.hub_score AS hub_score,
                   a.authority_score AS authority_score,
                   a.created_at AS created_at
            ORDER BY coalesce(a.pagerank, 0) DESC
            SKIP $offset LIMIT $limit
            """,
            community_id=community_id,
            offset=offset,
            limit=limit,
        )
        nodes = [dict(r) for r in result]
    return {"nodes": nodes, "limit": limit, "offset": offset}


@router.get("/edges")
async def get_edges(
    request: Request,
    limit: int = Query(5000, le=20000),
    offset: int = Query(0),
    community_id: int | None = Query(None),
):
    driver = request.app.state.driver
    with driver.session() as session:
        result = session.run(
            """
            MATCH (a:Agent)-[r:REPLIED_TO]->(b:Agent)
            WHERE $community_id IS NULL
               OR (a.community_id = $community_id AND b.community_id = $community_id)
            RETURN a.id AS source, b.id AS target, count(r) AS weight
            SKIP $offset LIMIT $limit
            """,
            community_id=community_id,
            offset=offset,
            limit=limit,
        )
        edges = [dict(r) for r in result]
    return {"edges": edges, "limit": limit, "offset": offset}


@router.get("/subgraph/{community_id}")
async def get_subgraph(request: Request, community_id: int):
    driver = request.app.state.driver
    with driver.session() as session:
        nodes_result = session.run(
            """
            MATCH (a:Agent {community_id: $cid})
            RETURN a.id AS id, a.name AS name, a.karma AS karma,
                   a.pagerank AS pagerank, a.trust_score AS trust_score
            ORDER BY coalesce(a.pagerank, 0) DESC
            """,
            cid=community_id,
        )
        nodes = [dict(r) for r in nodes_result]

        edges_result = session.run(
            """
            MATCH (a:Agent {community_id: $cid})-[r:REPLIED_TO]->(b:Agent {community_id: $cid})
            RETURN a.id AS source, b.id AS target, count(r) AS weight
            """,
            cid=community_id,
        )
        edges = [dict(r) for r in edges_result]

    return {"community_id": community_id, "nodes": nodes, "edges": edges}
