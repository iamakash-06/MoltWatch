"""Agent and submolt search endpoints."""
from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("")
async def search(
    request: Request,
    q: str = Query(..., min_length=1),
    type: str = Query("agents", pattern="^(agents|submolts|all)$"),
    limit: int = Query(20, le=100),
):
    driver = request.app.state.driver
    results = {"agents": [], "submolts": []}

    with driver.session() as session:
        if type in ("agents", "all"):
            agent_result = session.run(
                """
                MATCH (a:Agent)
                WHERE toLower(a.name) CONTAINS toLower($q)
                   OR toLower(coalesce(a.display_name, '')) CONTAINS toLower($q)
                RETURN a.id AS id, a.name AS name, a.karma AS karma,
                       a.community_id AS community_id, a.trust_score AS trust_score,
                       a.pagerank AS pagerank
                ORDER BY coalesce(a.pagerank, 0) DESC
                LIMIT $limit
                """,
                q=q,
                limit=limit,
            )
            results["agents"] = [dict(r) for r in agent_result]

        if type in ("submolts", "all"):
            submolt_result = session.run(
                """
                MATCH (s:Submolt)
                WHERE toLower(s.name) CONTAINS toLower($q)
                RETURN s.name AS name, s.subscriber_count AS subscriber_count,
                       s.post_count AS post_count
                ORDER BY s.subscriber_count DESC
                LIMIT $limit
                """,
                q=q,
                limit=limit,
            )
            results["submolts"] = [dict(r) for r in submolt_result]

    return {**results, "query": q}
