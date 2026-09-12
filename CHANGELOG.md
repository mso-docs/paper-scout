# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project has not yet had a versioned release; everything so far is
tracked under [Unreleased].

## [Unreleased]

### Added

- Step 4 highlighted-claim capture with a three-position context slider:
  Highlight only, Paragraph (default), and Section. Context previews preserve
  the complete selection and show explicit fallbacks for missing or oversized
  containers and selections spanning paragraphs.
- Paper metadata capture and preview, including title, URL, DOI/arXiv ID,
  authors, and available abstract text.
- Chromium smoke checks for selection capture, context previews, and existing
  connection/result behavior, plus optional live-page checks on the arXiv
  Attention Is All You Need abstract and Mixtral of Experts HTML paper.
  All 14 automated behavior tests and both browser checks passed on 2026-09-12.
- Root `requirements.txt` and `requirements-dev.txt` with pinned direct runtime,
  testing, and linting dependencies; `.python-version` sets Python 3.14.
- README Getting started instructions for pip on Windows, macOS, and Linux,
  optional uv setup, virtual environments, and shared dependency updates.
- Manifest V3 extension foundation with toolbar popup, on-demand first-heading
  capture, page title/URL, icons, and missing-heading/unsupported-page handling.
- Dependency-free capture behavior tests, a local HTML fixture, unpacked loading
  instructions, and an extension delivery checklist covering the remaining MVP
  and deferred work.
- Extension highlight + context capture: a three-level context-range slider
  (Highlight Only / Paragraph / Section) with DOM walk-up logic, paper
  metadata capture (title/abstract/DOI/URL), the `{ highlight, contextRange,
  context, pageMetadata }` payload contract documented in
  `extension/BACKEND_HANDOFF.md`, and fallback-with-warning behavior for
  missing/cross-paragraph/oversized contexts instead of silently clipping.

- `plan.md` — getting-started plan covering: research paper site selection,
  mission statement, Chrome extension bare bones, highlight+context capture
  (with a context-range slider: Highlight Only / Paragraph / Section),
  API rate limiting (with a per-source rate-limit registry), the backend
  agent pipeline, the sidebar UI, end-to-end "Scout this claim" wiring, and
  a local Docker setup for the backend.
- `backend/.env.example` — documents required/optional environment variables
  for the backend: `ANTHROPIC_API_KEY`, `SEMANTIC_SCHOLAR_API_KEY`,
  `OPENALEX_API_KEY`, `HUGGINGFACE_API_KEY`, and `PORT`.
- `.gitignore` — ignores `*.env` so real secrets are never committed.
- README additions describing the MVP concept and scope.
- Chat with Paper design added to `plan.md` and `docs/integrations.md`:
  browser-accessible PDF support (scoped as a stretch goal, including the
  open question of whether a content script can detect a highlight inside
  Chrome's built-in PDF viewer at all), the backend tech stack decision
  (Python/FastAPI/httpx/pydantic/python-dotenv/PyMuPDF), and the MVP
  content-retrieval decision (full paper text as LLM context, no
  chunking/embedding pipeline for now).
- `CODEOWNERS` — blanket ownership for the repo.
- Backend implementation (Python/FastAPI), covering `POST /investigate` and
  `POST /chat`:
  - `backend/app/main.py` — FastAPI app, permissive CORS, `/health`.
  - `backend/app/config.py` — env-based settings.
  - `backend/app/throttle.py` + `backend/app/rate_limits.py` — async
    per-source request throttle and its registry (arXiv, Semantic Scholar,
    OpenAlex, Hugging Face, Anthropic), verified with real timing tests.
  - `backend/app/providers/` — normalized search clients for arXiv,
    Semantic Scholar, OpenAlex, and Hugging Face, each failing soft on
    error so one provider going down doesn't fail the whole investigation.
  - `backend/app/llm.py` — Claude integration: `classify_evidence`
    (supporting/contradicting/qualifying/related, per claim + context +
    candidates) and `answer_question` (grounded Chat with Paper answers),
    both with JSON-parse-failure fallbacks.
  - `backend/app/investigate.py`, `app/chat.py`, `app/models.py` — request/
    response schemas and orchestration wiring the above into the two
    endpoints, with cross-provider deduplication (DOI → arXiv ID → title+year)
    and graceful degradation when providers or the LLM call fail.
  - `backend/Dockerfile`, `backend/docker-compose.yml`, root `.dockerignore`
    — containerized local run, verified against real network calls.
- README "Running the backend locally" section (Docker and non-Docker paths).

### Changed

- Marked all Step 3–4 items complete in `docs/plan.md` and refreshed extension
  status, capture behavior, and verification documentation. Backend integration
  and broader provider coverage remain separate work; backend code, API routing,
  and the existing client payload contract were not changed by this milestone.
- Abstract extraction uses explicit paper metadata or abstract DOM containers
  instead of treating generic site descriptions as paper abstracts.
- Expanded `.gitignore` to exclude Python virtual environments and tool caches.
- Aligned the backend to the extension's already-implemented API contract
  (`extension/BACKEND_HANDOFF.md`) instead of the earlier internal draft:
  endpoints renamed to `POST /v1/investigations` and `POST /v1/chat`,
  request/response bodies switched to the camelCase `schemaVersion`/
  `capture`-wrapped shape the client validates against, evidence category
  names changed to `supports`/`contradicts`/`qualifies`/`related` with
  `explanation` (not `supporting`/`why`), `GET /health` now returns
  `apiVersion`, added optional `Authorization: Bearer` backend-token auth,
  and a custom `ai` override is explicitly rejected with `422` (per the
  contract's own allowed fallback) rather than implemented. Verified live
  against the contract doc's own example payloads.
- Made HTML papers the required MVP path and PDF support a stretch goal;
  retained the PDF implementation plan without blocking MVP acceptance.

- Consolidated two divergent `.env.example` files (a root-level one listing
  OpenAlex/Hugging Face, and a `backend/`-scoped one listing Claude/Semantic
  Scholar) into a single `backend/.env.example` covering all four services.
- Added OpenAlex and Hugging Face to `plan.md`'s candidate research-site list
  to reflect that consolidation.
- `docs/business-logic.md` trimmed to stop repeating integration mechanics
  (provider table, architecture diagram, secrets/env vars) already owned by
  `docs/integrations.md`; now references it instead.
- README rewritten around a finalized two-mode mission statement (Claim
  Investigator + Chat with Paper) instead of the single-mode MVP draft.
- `plan.md` reorganized with explicit per-item ownership (Extension:
  Mackenzie; Backend + Docker: Ruben) and PDF support demoted to an explicit
  stretch goal across `plan.md`, `docs/integrations.md`, and README.
- Resolved a `git stash pop` conflict across `.gitignore`, `README.md`, and
  `docs/plan.md` additively (both sides' content combined) except for one
  genuine duplication that needed a decision rather than a merge: two
  `requirements.txt` files existed for the same backend dependencies (a
  root-level exact-pinned one and a `backend/`-scoped loose-pinned one).
  Root `requirements.txt`/`requirements-dev.txt` was made canonical; the
  Docker build context moved to the repo root so the Dockerfile can `COPY`
  it directly, and the Dockerfile's base image now matches the pinned
  `.python-version` (3.14).
- Fixed a real bug found via live end-to-end testing: the arXiv provider
  used `http://`, which now 301-redirects to `https://`, and `httpx`
  doesn't follow redirects by default — every arXiv search was silently
  failing. Fixed the URL and added `follow_redirects=True` defensively
  across all four provider clients.

### Removed

- Root-level `.env.example` (superseded by `backend/.env.example`).
- `backend/requirements.txt` and `backend/.dockerignore` (superseded by the
  canonical root-level files, per the requirements-file consolidation above).
