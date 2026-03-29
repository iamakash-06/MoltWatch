from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class MoltWatchConfig(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "moltwatch"

    db_path: Path = Path("data/moltwatch.db")
    moltbook_api_url: str = "https://www.moltbook.com/api/v1"

    transport: str = "stdio"
    log_level: str = "INFO"

    scraper_workers: int = 20
    scraper_max_connections: int = 100
    collection_interval_minutes: int = 30


settings = MoltWatchConfig()
