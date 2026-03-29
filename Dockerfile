FROM python:3.12-slim

WORKDIR /app

RUN pip install uv

COPY pyproject.toml .
COPY src/ src/

RUN uv pip install --system -e .

COPY scripts/ scripts/

EXPOSE 8000

CMD ["uvicorn", "moltwatch.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
