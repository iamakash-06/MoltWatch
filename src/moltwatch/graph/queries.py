"""Reusable Cypher query library — all graph queries live here."""

# ---------------------------------------------------------------------------
# Node counts & overview
# ---------------------------------------------------------------------------

AGENT_COUNT = "MATCH (a:Agent) RETURN count(a) AS count"
POST_COUNT = "MATCH (p:Post) RETURN count(p) AS count"
SUBMOLT_COUNT = "MATCH (s:Submolt) RETURN count(s) AS count"
INTERACTION_COUNT = "MATCH ()-[r:REPLIED_TO]->() RETURN count(r) AS count"

NETWORK_OVERVIEW = """
MATCH (a:Agent) WITH count(a) AS agents
MATCH (s:Submolt) WITH agents, count(s) AS submolts
MATCH ()-[r:REPLIED_TO]->() WITH agents, submolts, count(r) AS reply_edges
OPTIONAL MATCH (a2:Agent) WHERE a2.pagerank IS NOT NULL
WITH agents, submolts, reply_edges, count(a2) AS agents_with_pagerank
RETURN agents, submolts, reply_edges, agents_with_pagerank
"""

# ---------------------------------------------------------------------------
# Centrality
# ---------------------------------------------------------------------------

TOP_AGENTS_BY_PAGERANK = """
MATCH (a:Agent)
WHERE a.pagerank IS NOT NULL
RETURN a.id AS id, a.name AS name, a.pagerank AS pagerank,
       a.community_id AS community_id, a.karma AS karma,
       a.trust_score AS trust_score
ORDER BY a.pagerank DESC
LIMIT $limit
"""

TOP_AGENTS_BY_KARMA = """
MATCH (a:Agent)
RETURN a.id AS id, a.name AS name, a.karma AS karma,
       a.community_id AS community_id, a.pagerank AS pagerank
ORDER BY a.karma DESC
LIMIT $limit
"""

ALL_AGENT_METRIC = """
MATCH (a:Agent)
RETURN a[$metric] AS value
ORDER BY value
"""

AGENT_DEGREE = """
MATCH (a:Agent)
OPTIONAL MATCH (a)-[out:REPLIED_TO]->()
OPTIONAL MATCH ()-[in:REPLIED_TO]->(a)
RETURN a.id AS id, a.name AS name,
       count(DISTINCT out) AS out_degree,
       count(DISTINCT in) AS in_degree
ORDER BY in_degree DESC
LIMIT $limit
"""

# ---------------------------------------------------------------------------
# Community
# ---------------------------------------------------------------------------

COMMUNITY_SUBGRAPH = """
MATCH (a:Agent {community_id: $community_id})-[r:REPLIED_TO]->(b:Agent {community_id: $community_id})
RETURN a.id AS source, b.id AS target, count(r) AS weight
"""

COMMUNITY_SUMMARY = """
MATCH (a:Agent {community_id: $community_id})
WITH count(a) AS member_count,
     avg(a.karma) AS avg_karma,
     avg(a.pagerank) AS avg_pagerank,
     collect(a)[..10] AS top_agents
RETURN member_count, avg_karma, avg_pagerank, top_agents
"""

COMMUNITY_LIST = """
MATCH (a:Agent)
WHERE a.community_id IS NOT NULL
RETURN a.community_id AS community_id, count(a) AS member_count
ORDER BY member_count DESC
"""

COMMUNITY_INTERNAL_EDGES = """
MATCH (a:Agent {community_id: $community_id})-[r:REPLIED_TO]->(b:Agent {community_id: $community_id})
RETURN count(r) AS internal_edges
"""

COMMUNITY_EXTERNAL_EDGES = """
MATCH (a:Agent {community_id: $community_id})-[r:REPLIED_TO]->(b:Agent)
WHERE b.community_id <> $community_id
RETURN count(r) AS external_edges
"""

COMMUNITY_TOP_AGENTS = """
MATCH (a:Agent {community_id: $community_id})
RETURN a.id AS id, a.name AS name, a.pagerank AS pagerank,
       a.karma AS karma, a.trust_score AS trust_score,
       a.hub_score AS hub_score, a.authority_score AS authority_score
ORDER BY coalesce(a.pagerank, 0) DESC
LIMIT $limit
"""

COMMUNITY_DOMINANT_SUBMOLTS = """
MATCH (a:Agent {community_id: $community_id})-[:POSTED_IN]->(s:Submolt)
RETURN s.name AS submolt, count(*) AS post_count
ORDER BY post_count DESC
LIMIT 10
"""

# ---------------------------------------------------------------------------
# Temporal
# ---------------------------------------------------------------------------

AGENT_POST_TIMES = """
MATCH (p:Post {agent_id: $agent_id})
RETURN p.created_at AS timestamp
ORDER BY p.created_at
"""

ALL_AGENTS_WITH_MIN_POSTS = """
MATCH (a:Agent)
WHERE a.post_count >= $min_posts
RETURN a.id AS id, a.name AS name, a.post_count AS post_count
"""

POSTS_IN_WINDOW = """
MATCH (p:Post)
WHERE p.created_at >= $start AND p.created_at <= $end
RETURN p.agent_id AS agent_id, p.created_at AS created_at,
       p.submolt AS submolt, p.id AS post_id
ORDER BY p.created_at
"""

# ---------------------------------------------------------------------------
# Anomaly / Coordination
# ---------------------------------------------------------------------------

BROADCAST_AGENTS = """
MATCH (a:Agent)-[r:REPLIED_TO]->(b:Agent)
WITH b, count(DISTINCT a) AS in_degree, count(r) AS total_replies
WHERE in_degree > $threshold
MATCH (b)-[r2:REPLIED_TO]->(c:Agent)
WITH b, in_degree, total_replies, count(DISTINCT c) AS out_degree
RETURN b.id AS id, b.name AS name, in_degree, out_degree, total_replies,
       toFloat(in_degree) / (in_degree + out_degree + 1) AS broadcast_ratio
ORDER BY broadcast_ratio DESC
LIMIT $limit
"""

MUTUAL_UPVOTERS = """
MATCH (a:Agent)-[:UPVOTED]->(b:Agent),
      (b:Agent)-[:UPVOTED]->(a:Agent)
WITH a, b, count(*) AS mutual_votes
WHERE mutual_votes >= $min_votes AND a.id < b.id
RETURN a.id AS agent_a, b.id AS agent_b, mutual_votes
ORDER BY mutual_votes DESC
LIMIT $limit
"""

# ---------------------------------------------------------------------------
# Influence propagation
# ---------------------------------------------------------------------------

INFLUENCE_REACH_1HOP = """
MATCH (source:Agent {id: $agent_id})-[:REPLIED_TO]->(target:Agent)
RETURN DISTINCT target.id AS id, target.name AS name, 1 AS depth
"""

INFLUENCE_REACH_2HOP = """
MATCH (source:Agent {id: $agent_id})-[:REPLIED_TO*1..2]->(target:Agent)
WHERE target.id <> $agent_id
RETURN DISTINCT target.id AS id, target.name AS name,
       min(length(shortestPath((source)-[:REPLIED_TO*]->(target)))) AS depth
"""

INFLUENCE_REACH_3HOP = """
MATCH path = (source:Agent {id: $agent_id})-[:REPLIED_TO*1..3]->(target:Agent)
WHERE target.id <> $agent_id
RETURN DISTINCT target.id AS id, target.name AS name,
       min(length(path)) AS depth
"""

AGENT_NEIGHBORS = """
MATCH (a:Agent {id: $agent_id})-[:REPLIED_TO]->(b:Agent)
RETURN b.id AS id, b.name AS name, b.community_id AS community_id
"""

# ---------------------------------------------------------------------------
# Agent detail / profile
# ---------------------------------------------------------------------------

AGENT_BY_NAME = """
MATCH (a:Agent {name: $name})
RETURN a
"""

AGENT_BY_ID = """
MATCH (a:Agent {id: $id})
RETURN a
"""

AGENT_PROFILE = """
MATCH (a:Agent {id: $agent_id})
OPTIONAL MATCH (a)-[:POSTED_IN]->(s:Submolt)
WITH a, collect(DISTINCT s.name) AS submolts
OPTIONAL MATCH (a)-[out:REPLIED_TO]->()
WITH a, submolts, count(DISTINCT out) AS out_degree
OPTIONAL MATCH ()-[in:REPLIED_TO]->(a)
RETURN a.id AS id, a.name AS name, a.karma AS karma,
       a.pagerank AS pagerank, a.community_id AS community_id,
       a.trust_score AS trust_score, a.hub_score AS hub_score,
       a.authority_score AS authority_score, a.cov_score AS cov_score,
       a.created_at AS created_at, submolts,
       out_degree, count(DISTINCT in) AS in_degree
"""

AGENT_TOP_INTERACTED = """
MATCH (a:Agent {id: $agent_id})-[r:REPLIED_TO]->(b:Agent)
RETURN b.id AS id, b.name AS name, count(r) AS interactions
ORDER BY interactions DESC
LIMIT 10
"""

# ---------------------------------------------------------------------------
# Graph visualization endpoints
# ---------------------------------------------------------------------------

NODES_PAGINATED = """
MATCH (a:Agent)
WHERE $community_id IS NULL OR a.community_id = $community_id
RETURN a.id AS id, a.name AS name, a.karma AS karma,
       a.pagerank AS pagerank, a.community_id AS community_id,
       a.trust_score AS trust_score, a.hub_score AS hub_score,
       a.authority_score AS authority_score
ORDER BY coalesce(a.pagerank, 0) DESC
SKIP $offset LIMIT $limit
"""

EDGES_PAGINATED = """
MATCH (a:Agent)-[r:REPLIED_TO]->(b:Agent)
WHERE $community_id IS NULL
   OR (a.community_id = $community_id AND b.community_id = $community_id)
RETURN a.id AS source, b.id AS target, count(r) AS weight
SKIP $offset LIMIT $limit
"""
