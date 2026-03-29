"""Generate structured threat intelligence reports."""
import logging
from datetime import datetime, timezone

from neo4j import Driver
from graphdatascience import GraphDataScience

from moltwatch.analysis.centrality import CentralityAnalyzer
from moltwatch.analysis.community import CommunityAnalyzer
from moltwatch.analysis.temporal import TemporalAnalyzer
from moltwatch.analysis.anomaly import AnomalyDetector
from moltwatch.analysis.influence import InfluenceModeler
from moltwatch.analysis.trust import TrustScorer, set_flagged_agents

logger = logging.getLogger(__name__)


class ReportGenerator:
    def __init__(self, driver: Driver, gds: GraphDataScience):
        self.driver = driver
        self.gds = gds
        self.centrality = CentralityAnalyzer(driver, gds)
        self.community = CommunityAnalyzer(driver, gds)
        self.temporal = TemporalAnalyzer(driver)
        self.anomaly = AnomalyDetector(driver)
        self.influence = InfluenceModeler(driver)
        self.trust = TrustScorer(driver)

    def generate_full_report(self) -> dict:
        """Comprehensive threat intelligence report."""
        logger.info("Generating full threat report...")
        now = datetime.now(timezone.utc)

        # Network overview
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (a:Agent) WITH count(a) AS agents
                MATCH (s:Submolt) WITH agents, count(s) AS submolts
                OPTIONAL MATCH ()-[r:REPLIED_TO]->()
                RETURN agents, submolts, count(r) AS reply_edges
                """
            ).single()
            overview = dict(result) if result else {}

        # Centrality
        centrality_report = self.centrality.generate_centrality_report(top_n=10)

        # Community
        communities = self.community.get_all_communities()
        modularity = self.community.compute_modularity()
        echo_chambers = self.community.detect_echo_chambers()

        # Temporal
        burst_events = self.temporal.detect_burst_events()
        cov_classification = self.temporal.classify_agents_by_cov()

        # Anomaly
        coord_clusters = self.anomaly.detect_coordinated_clusters(min_cluster_size=3)
        vote_rings = self.anomaly.detect_vote_manipulation(min_mutual_votes=5)
        rapid_communities = self.anomaly.detect_rapid_community_formation()

        # Populate flagged agents for trust scoring
        flagged_ids = [aid for c in coord_clusters for aid in c.get("agent_ids", [])]
        set_flagged_agents(flagged_ids)

        # Influence
        critical_nodes = self.influence.find_critical_nodes(top_k=10)
        injection_paths = self.influence.detect_injection_propagation_paths(top_k=5)

        # Trust (summary only)
        low_trust = self.trust.get_low_trust_agents(threshold=30.0, limit=20)

        return {
            "generated_at": now.isoformat(),
            "network_overview": {
                **overview,
                "communities": len(communities),
                "modularity": modularity,
            },
            "centrality": centrality_report,
            "community_analysis": {
                "communities": communities[:20],
                "modularity": modularity,
                "echo_chambers": echo_chambers[:10],
            },
            "temporal_analysis": {
                "burst_events": burst_events[:10],
                "cov_summary": {
                    "autonomous_count": len(cov_classification["autonomous"]),
                    "human_driven_count": len(cov_classification["human_driven"]),
                    "insufficient_data_count": len(cov_classification["insufficient_data"]),
                },
            },
            "threats": {
                "coordinated_clusters": coord_clusters[:20],
                "vote_rings": vote_rings[:20],
                "rapid_communities": rapid_communities[:10],
                "total_flagged_agents": len(set(flagged_ids)),
            },
            "influence": {
                "critical_nodes": critical_nodes,
                "injection_paths": injection_paths,
            },
            "trust": {
                "low_trust_agents": low_trust,
            },
            "recommendations": self._generate_recommendations(
                coord_clusters, echo_chambers, critical_nodes, modularity
            ),
        }

    def generate_agent_report(self, agent_id: str) -> dict:
        """Detailed report for a single agent."""
        with self.driver.session() as session:
            result = session.run("MATCH (a:Agent {id: $id}) RETURN a", id=agent_id).single()
            if not result:
                return {"error": f"Agent {agent_id} not found"}
            agent = dict(result["a"])

        heartbeat = self.temporal.compute_heartbeat_fingerprint(agent_id)
        blast = self.influence.compute_blast_radius(agent_id)
        trust = self.trust.compute_trust_score(agent_id)

        return {
            "agent": agent,
            "heartbeat": heartbeat,
            "blast_radius": blast,
            "trust": trust,
        }

    def generate_community_report(self, community_id: int) -> dict:
        """Detailed report for a community/cluster."""
        summary = self.community.get_community_summary(community_id)
        echo = [e for e in self.community.detect_echo_chambers() if e["community_id"] == community_id]
        return {
            "summary": summary,
            "echo_chamber_assessment": echo[0] if echo else None,
        }

    def _generate_recommendations(
        self,
        coord_clusters: list,
        echo_chambers: list,
        critical_nodes: list,
        modularity: float,
    ) -> list[str]:
        recs = []
        if coord_clusters:
            recs.append(
                f"ALERT: {len(coord_clusters)} coordinated clusters detected. "
                f"Investigate agents: {', '.join(coord_clusters[0].get('agent_ids', [])[:5])}"
            )
        if echo_chambers:
            recs.append(
                f"WARN: {len(echo_chambers)} echo chambers detected (isolation ratio > 0.8). "
                "High modularity may amplify manipulation campaigns."
            )
        if modularity > 0.9:
            recs.append(
                f"INFO: Extremely high network modularity (Q={modularity:.2f}). "
                "Agent communities are highly isolated — manipulation can spread rapidly within clusters."
            )
        if critical_nodes:
            top_node = critical_nodes[0]
            recs.append(
                f"PRIORITY: Agent '{top_node.get('name')}' is the most critical node "
                f"(blast radius: {top_node.get('blast_radius', {}).get('hop2', 0)} agents at 2-hop). "
                "Prioritize monitoring."
            )
        if not recs:
            recs.append("No critical threats detected. Network appears within normal parameters.")
        return recs
