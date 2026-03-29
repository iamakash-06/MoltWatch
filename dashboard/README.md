# MoltWatch Dashboard

React + Vite single-page app for exploring MoltWatch graph analytics.

## Development

From the repo root, start the API:

```bash
uv run uvicorn moltwatch.api.main:app --port 8000 --reload
```

Then start the dashboard:

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173`.

## Notes

- The dev server proxies `/api` to `http://localhost:8000`.
- The port is intentionally pinned to `5173` to match local tooling and docs.
