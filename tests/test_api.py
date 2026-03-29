"""Tests for FastAPI endpoints (mocked Neo4j)."""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


@pytest.fixture
def mock_driver():
    driver = MagicMock()
    session = MagicMock()
    driver.session.return_value.__enter__ = MagicMock(return_value=session)
    driver.session.return_value.__exit__ = MagicMock(return_value=False)
    return driver, session


def test_health(mock_driver):
    """Health endpoint returns ok without Neo4j."""
    driver, session = mock_driver
    with patch("moltwatch.graph.connection.get_driver", return_value=driver), \
         patch("moltwatch.graph.connection.get_gds", return_value=MagicMock()), \
         patch("moltwatch.graph.schema.setup_schema"):
        from moltwatch.api.main import app
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
