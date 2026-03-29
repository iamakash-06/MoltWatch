"""Threat feed endpoints."""
from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/campaigns")
async def get_campaigns(
    request: Request,
    min_cluster_size: int = Query(3),
    limit: int = Query(50),
):
    driver = request.app.state.driver
    from moltwatch.analysis.anomaly import AnomalyDetector

    detector = AnomalyDetector(driver)
    clusters = detector.detect_coordinated_clusters(min_cluster_size=min_cluster_size)
    vote_rings = detector.detect_vote_manipulation(min_mutual_votes=3)
    rapid = detector.detect_rapid_community_formation()

    threats = []
    for i, c in enumerate(clusters[:limit]):
        threats.append({
            "id": f"campaign_{i}",
            "threat_type": c.get("cluster_type", "coordinated_cluster"),
            "severity": c.get("severity", "MEDIUM"),
            "agent_ids": c.get("agent_ids", []),
            "coordination_score": c.get("coordination_score", 0),
            "evidence_types": c.get("evidence_types", []),
            "submolts": c.get("submolts", []),
            "description": f"Coordinated cluster of {len(c.get('agent_ids', []))} agents detected via {', '.join(c.get('evidence_types', []))}",
        })

    return {
        "campaigns": threats,
        "vote_rings": vote_rings[:20],
        "rapid_communities": rapid[:10],
        "total": len(threats),
    }


@router.get("/anomalies")
async def get_anomalies(request: Request, lookback_hours: int = Query(24)):
    driver = request.app.state.driver
    from moltwatch.analysis.temporal import TemporalAnalyzer

    temporal = TemporalAnalyzer(driver)
    bursts = temporal.detect_burst_events(window_minutes=30, threshold_posts=20)
    sync_groups = temporal.detect_synchronized_posting(time_tolerance_seconds=60)

    anomalies = []
    for i, b in enumerate(bursts[:20]):
        anomalies.append({
            "id": f"burst_{i}",
            "type": "burst_event",
            "severity": b.get("severity", "MEDIUM"),
            "timestamp": b.get("start_time"),
            "description": f"Burst: {b.get('post_count', 0)} posts in 30min by {b.get('unique_agents', 0)} agents",
            "agents": b.get("agent_ids", [])[:10],
            "submolts": b.get("submolts", []),
        })

    for i, sg in enumerate(sync_groups[:20]):
        anomalies.append({
            "id": f"sync_{i}",
            "type": "synchronized_posting",
            "severity": "MEDIUM",
            "timestamp": sg.get("window_start"),
            "description": f"Synchronized posting: {sg.get('agent_count', 0)} agents within {sg.get('tolerance_seconds', 60)}s",
            "agents": sg.get("agent_ids", []),
            "submolts": sg.get("submolts", []),
        })

    return {"anomalies": anomalies, "total": len(anomalies)}


@router.get("/critical-nodes")
async def get_critical_nodes(request: Request, top_k: int = Query(20, le=100)):
    driver = request.app.state.driver
    from moltwatch.analysis.influence import InfluenceModeler

    modeler = InfluenceModeler(driver)
    nodes = modeler.find_critical_nodes(top_k=top_k)
    return {"critical_nodes": nodes, "total": len(nodes)}


@router.get("/injection-paths")
async def get_injection_paths(request: Request, top_k: int = Query(10, le=50)):
    driver = request.app.state.driver
    from moltwatch.analysis.influence import InfluenceModeler

    modeler = InfluenceModeler(driver)
    paths = modeler.detect_injection_propagation_paths(top_k=top_k)
    return {"paths": paths, "total": len(paths)}
