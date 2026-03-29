"""Analysis results endpoints."""
from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/centrality")
async def get_centrality(request: Request, limit: int = Query(50, le=500)):
    driver = request.app.state.driver
    gds = request.app.state.gds
    from moltwatch.analysis.centrality import CentralityAnalyzer

    analyzer = CentralityAnalyzer(driver, gds)
    report = analyzer.generate_centrality_report(top_n=limit)
    return report


@router.get("/communities")
async def get_communities(request: Request):
    driver = request.app.state.driver
    gds = request.app.state.gds
    from moltwatch.analysis.community import CommunityAnalyzer

    analyzer = CommunityAnalyzer(driver, gds)
    communities = analyzer.get_all_communities()
    modularity = analyzer.compute_modularity()
    echo_chambers = analyzer.detect_echo_chambers()
    return {
        "communities": communities,
        "modularity": modularity,
        "echo_chambers": echo_chambers,
    }


@router.get("/communities/{community_id}")
async def get_community_detail(request: Request, community_id: int):
    driver = request.app.state.driver
    gds = request.app.state.gds
    from moltwatch.analysis.community import CommunityAnalyzer

    analyzer = CommunityAnalyzer(driver, gds)
    return analyzer.get_community_summary(community_id)


@router.get("/gini")
async def get_gini(request: Request):
    driver = request.app.state.driver
    gds = request.app.state.gds
    from moltwatch.analysis.centrality import CentralityAnalyzer

    analyzer = CentralityAnalyzer(driver, gds)
    return {
        "karma": analyzer.compute_gini_coefficient("karma"),
        "pagerank": analyzer.compute_gini_coefficient("pagerank"),
        "post_count": analyzer.compute_gini_coefficient("post_count"),
        "comment_count": analyzer.compute_gini_coefficient("comment_count"),
        "moltbook_benchmarks": {
            "upvotes": 0.99,
            "posts": 0.60,
            "comments": 0.74,
        },
    }


@router.post("/run/pagerank")
async def run_pagerank(request: Request):
    driver = request.app.state.driver
    gds = request.app.state.gds
    from moltwatch.analysis.centrality import CentralityAnalyzer

    analyzer = CentralityAnalyzer(driver, gds)
    result = analyzer.run_pagerank()
    return {"status": "ok", "nodes_written": result.get("nodePropertiesWritten", 0)}


@router.post("/run/louvain")
async def run_louvain(request: Request):
    driver = request.app.state.driver
    gds = request.app.state.gds
    from moltwatch.analysis.community import CommunityAnalyzer

    analyzer = CommunityAnalyzer(driver, gds)
    result = analyzer.run_louvain()
    return {"status": "ok", **result}


@router.post("/run/all")
async def run_all_analysis(request: Request):
    """Run all analysis pipelines: PageRank, HITS, Betweenness, Louvain, CoV, Trust."""
    driver = request.app.state.driver
    gds = request.app.state.gds
    from moltwatch.analysis.centrality import CentralityAnalyzer
    from moltwatch.analysis.community import CommunityAnalyzer
    from moltwatch.analysis.temporal import TemporalAnalyzer
    from moltwatch.analysis.trust import TrustScorer, set_flagged_agents
    from moltwatch.analysis.anomaly import AnomalyDetector

    results = {}
    centrality = CentralityAnalyzer(driver, gds)
    results["pagerank"] = centrality.run_pagerank()
    results["hits"] = centrality.run_hits()
    results["betweenness"] = centrality.run_betweenness()

    community = CommunityAnalyzer(driver, gds)
    results["louvain"] = community.run_louvain()

    temporal = TemporalAnalyzer(driver)
    cov = temporal.classify_agents_by_cov()
    results["cov"] = {
        "autonomous": len(cov["autonomous"]),
        "human_driven": len(cov["human_driven"]),
    }

    anomaly = AnomalyDetector(driver)
    clusters = anomaly.detect_coordinated_clusters(min_cluster_size=3)
    flagged = [aid for c in clusters for aid in c.get("agent_ids", [])]
    set_flagged_agents(flagged)

    trust = TrustScorer(driver)
    scores = trust.compute_all_trust_scores()
    results["trust"] = {"agents_scored": len(scores)}

    return {"status": "ok", "results": results}
