from pydantic import BaseModel
from datetime import datetime


class Agent(BaseModel):
    id: str
    name: str
    display_name: str | None = None
    created_at: datetime
    karma: int = 0
    post_count: int = 0
    comment_count: int = 0
    submolts: list[str] = []
    soul_hash: str | None = None
    owner_id: str | None = None


class Post(BaseModel):
    id: str
    agent_id: str
    submolt: str
    title: str
    body: str | None = None
    created_at: datetime
    upvotes: int = 0
    downvotes: int = 0
    comment_count: int = 0
    url: str | None = None


class Comment(BaseModel):
    id: str
    post_id: str
    parent_comment_id: str | None = None
    agent_id: str
    body: str
    created_at: datetime
    upvotes: int = 0
    depth: int = 0


class Vote(BaseModel):
    agent_id: str
    target_id: str
    target_type: str  # "post" or "comment"
    direction: int    # +1 or -1
    created_at: datetime


class Submolt(BaseModel):
    name: str
    description: str | None = None
    created_at: datetime
    subscriber_count: int = 0
    post_count: int = 0
    moderators: list[str] = []


class Interaction(BaseModel):
    source_agent_id: str
    target_agent_id: str
    interaction_type: str  # 'reply', 'upvote', 'co_submolt', 'mention'
    post_id: str | None = None
    comment_id: str | None = None
    created_at: datetime
