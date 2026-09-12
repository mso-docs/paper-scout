# Build context is the repo root (see backend/docker-compose.yml), so this
# can reach the root-level requirements.txt — the single canonical pinned
# dependency file, matching .python-version and the "Getting started" venv
# workflow in README.md. Do not reintroduce a backend/requirements.txt.

FROM python:3.14-slim

WORKDIR /app

# Install dependencies first so this layer is cached unless requirements change.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Now copy just the backend source (paths are relative to the repo root).
COPY backend/app ./app

EXPOSE 8787

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8787"]
