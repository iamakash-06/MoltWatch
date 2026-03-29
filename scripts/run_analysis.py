#!/usr/bin/env python3
"""Run all analysis pipelines on the loaded graph data."""
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("run_analysis")


def main():
    from moltwatch.graph.connection import get_driver, get_gds
    from moltwatch.graph.schema import setup_schema
    from moltwatch.analysis.centrality import CentralityAnalyzer
    from moltwatch.analysis.community import CommunityAnalyzer
    from moltwatch.analysis.temporal import TemporalAnalyzer
    from moltwatch.analysis.anomaly import AnomalyDetector
    from moltwatch.analysis.trust import TrustScorer, set_flagged_agents

    driver = get_driver()
    gds = get_gds()
    setup_schema(driver)

    logger.info("Step 1/5: Running PageRank + HITS + Betweenness...")
    centrality = CentralityAnalyzer(driver, gds)
    centrality.run_pagerank(force_reproject=True)
    centrality.run_hits()
    centrality.run_betweenness()

    logger.info("Step 2/5: Running Louvain community detection...")
    community = CommunityAnalyzer(driver, gds)
    louvain_result = community.run_louvain()
    logger.info(f"  → {louvain_result['communities']} communities, modularity={louvain_result['modularity']:.4f}")

    logger.info("Step 3/5: Computing CoV (temporal signatures)...")
    temporal = TemporalAnalyzer(driver)
    cov = temporal.classify_agents_by_cov()
    logger.info(
        f"  → {len(cov['autonomous'])} autonomous, "
        f"{len(cov['human_driven'])} human-driven, "
        f"{len(cov['insufficient_data'])} insufficient data"
    )

    logger.info("Step 4/5: Detecting coordinated clusters...")
    anomaly = AnomalyDetector(driver)
    clusters = anomaly.detect_coordinated_clusters(min_cluster_size=3)
    flagged = [aid for c in clusters for aid in c.get("agent_ids", [])]
    set_flagged_agents(flagged)
    logger.info(f"  → {len(clusters)} clusters, {len(set(flagged))} flagged agents")

    logger.info("Step 5/5: Computing trust scores...")
    trust = TrustScorer(driver)
    scores = trust.compute_all_trust_scores()
    low_trust = [s for s in scores if s["trust_score"] < 30]
    logger.info(f"  → {len(scores)} agents scored, {len(low_trust)} low-trust agents")

    logger.info("Analysis complete!")

    # Print summary
    report = centrality.generate_centrality_report(top_n=5)
    print("\n=== TOP 5 AGENTS BY PAGERANK ===")
    for a in report["top_agents_by_pagerank"]:
        print(f"  {a['name']:20s} pagerank={a['pagerank']:.5f} community={a['community_id']}")
    print(f"\nGini coefficients: karma={report['gini']['karma']:.4f}, pagerank={report['gini']['pagerank']:.4f}")
    if clusters:
        print(f"\n=== DETECTED {len(clusters)} COORDINATED CLUSTERS ===")
        for c in clusters[:3]:
            print(f"  [{c['cluster_type']}] {len(c.get('agent_ids', []))} agents, score={c.get('coordination_score', 0):.3f}")


if __name__ == "__main__":
    main()
