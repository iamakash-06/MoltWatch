"""Individual agent detail and history endpoints."""
from fastapi import APIRouter, Request, HTTPException

router = APIRouter()


@router.get("/{agent_id}")
async def get_agent(request: Request, agent_id: str):
    driver = request.app.state.driver
    from moltwatch.analysis.trust import TrustScorer
    from moltwatch.analysis.temporal import TemporalAnalyzer
    from moltwatch.analysis.influence import InfluenceModeler

    with driver.session() as session:
        result = session.run(
            "MATCH (a:Agent) WHERE a.id = $id OR a.name = $id RETURN a LIMIT 1",
            id=agent_id,
        ).single()
        if not result:
            raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
        agent = dict(result["a"])
        real_id = agent["id"]

        out_deg = session.run(
            "MATCH (a:Agent {id: $id})-[:REPLIED_TO]->(b) RETURN count(DISTINCT b) AS c",
            id=real_id,
        ).single()["c"]
        in_deg = session.run(
            "MATCH (b)-[:REPLIED_TO]->(a:Agent {id: $id}) RETURN count(DISTINCT b) AS c",
            id=real_id,
        ).single()["c"]
        submolts = session.run(
            "MATCH (a:Agent {id: $id})-[:POSTED_IN]->(s:Submolt) RETURN s.name AS name",
            id=real_id,
        ).data()
        top_interactions = session.run(
            """
            MATCH (a:Agent {id: $id})-[r:REPLIED_TO]->(b:Agent)
            RETURN b.id AS id, b.name AS name, count(r) AS interactions
            ORDER BY interactions DESC LIMIT 10
            """,
            id=real_id,
        ).data()

    trust = TrustScorer(driver)
    trust_data = trust.compute_trust_score(real_id)
    temporal = TemporalAnalyzer(driver)
    heartbeat = temporal.compute_heartbeat_fingerprint(real_id)

    return {
        **agent,
        "out_degree": out_deg,
        "in_degree": in_deg,
        "submolts": [s["name"] for s in submolts],
        "top_interactions": top_interactions,
        "trust": trust_data,
        "heartbeat": heartbeat,
    }


@router.get("/{agent_id}/timeline")
async def get_agent_timeline(request: Request, agent_id: str):
    driver = request.app.state.driver
    with driver.session() as session:
        result = session.run(
            "MATCH (a:Agent) WHERE a.id = $id OR a.name = $id RETURN a.id AS real_id LIMIT 1",
            id=agent_id,
        ).single()
        if not result:
            raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
        real_id = result["real_id"]

        posts = session.run(
            """
            MATCH (p:Post {agent_id: $id})
            RETURN p.id AS id, p.created_at AS created_at, p.submolt AS submolt,
                   p.upvotes AS upvotes, p.comment_count AS comment_count
            ORDER BY p.created_at DESC
            LIMIT 100
            """,
            id=real_id,
        ).data()

    return {"agent_id": real_id, "posts": posts, "total": len(posts)}
