# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project has not yet had a versioned release; everything so far is
tracked under [Unreleased].

## [Unreleased]

### Fixed

- Updated sidebar investigation/chat requests to the running backend’s
  `/v1/investigations` and `/v1/chat` routes and versioned camelCase payloads,
  fixing 404s after the backend contract changed. Adapted evidence categories,
  explanations and warning rendering; updated sidebar/context-menu fixtures.
- Sidebar permission errors now expand Connection settings with explicit
  instructions to save and accept Chrome’s backend-host permission prompt.

- Paragraph context now recognizes arXiv’s `blockquote.abstract` and `.ltx_p`
  markup, fixing highlight-only fallback on abstract pages such as 2609.11916.
  Abstract containers with multiple real paragraphs still fall back safely;
  oversized context is never truncated. Added regression coverage and the
  reported paper to the real-page Chromium checks. Unit tests and Chromium
  checks passed for 1706.03762, 2609.11916 and Mixtral HTML; refreshed capture
  documentation to reflect expanded abstract paragraph support.

### Added

- Chrome Side Panel UI for Steps 8 and 14 with Investigate / Chat with Paper
  modes, selection/context preview, four evidence categories and source links,
  empty-result notices, loading, cancellation, timeouts and error states.
- Step 15 toolbar-popup entry point that opens the sidebar without a highlight;
  question submission captures HTML paper text and metadata and calls `/chat`.
  Conversation history distinguishes grounded and ungrounded responses, supports
  clearing, and resets on source navigation/tab switches. History is display-only;
  backend questions remain independent.
- `backend-api.mjs` adapts sidebar requests to the existing snake_case
  `/investigate` and `/chat` contracts, validates responses, suppresses unsafe
  source links, distinguishes backend chat failures from absent evidence, and
  rejects unsupported custom AI settings before forwarding credentials.
- `paper-content.js` extracts article/main/body text, excludes controls and hidden
  content, and rejects empty, PDF and over-200,000-character input without
  truncation. Sidebar submissions retain source identity and reject stale results.
- Sidebar connection settings reuse the popup’s backend URL/token storage and
  optional host permissions. Captures, mode switches and history stay local until
  an explicit investigation/question submission.
- Backend-adapter unit checks and a real Chromium sidebar smoke test for both
  modes, safe rendering, payloads, history, empty results, cancellation/failures,
  navigation reset and bounded HTML extraction; optional live arXiv/FastAPI chat
  acceptance via `--real-backend` on port 8788.
  Validation on 2026-09-12: unit checks, existing popup browser regression,
  sidebar browser smoke checks and `git diff --check` passed. Live AI acceptance
  remains blocked as described below.

- Step 9 selection context menu, **Scout this claim**, with a Manifest V3
  service worker that opens the sidebar during the click gesture and captures
  the highlighted HTML claim. A window-scoped session handoff supports cold
  sidebar startup and subsequent selections without persisting paper text to disk.
- Automatic sidebar investigations using the existing `/investigate` backend
  adapter, saved context range, source-page checks, loading/errors, cancellation
  of superseded requests, and removal of consumed handoffs. Changed selections
  and embedded-frame selections fail explicitly rather than sending another claim.
- Menu registration/gesture and invalid-selection tests plus a Chromium smoke
  check for cold/warm sidebar delivery, actual HTTP payloads, evidence rendering,
  and backend errors. Live arXiv HTML → FastAPI → sidebar verified 2026-09-12;
  the live backend returned classification-unavailable fallback. Native menu
  clicking remains manual; automation invokes its handler with real browser APIs.

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

- Extension version is 0.3.0, adds `sidePanel` permission/default panel and requires
  Chrome 116+. The original popup remains separate and links to the sidebar.
- Updated root/extension READMEs, extension delivery checklist and backend handoff
  to document actual sidebar contracts, usage, content/history limits and checks;
  distinguished them from the legacy popup’s proposed versioned API.
- Checked off Steps 8 and 14, Step 15’s three implementation items, and Step 13’s
  prerequisite metadata/HTML capture items in `docs/plan.md`. The final Step 15
  live-answer acceptance remains unchecked: on 2026-09-12, the live Mixtral HTML
  page reached the real FastAPI `/chat` route, but Anthropic returned 401 with
  the available credentials. The sidebar correctly displayed the failure.

- Popup context-slider and sidebar context choices now save the preference used
  by the selection menu without rewriting connection secrets.
- Checked off step 9 in `docs/plan.md` and documented setup, verification commands,
  and the limits of live-backend verification in the extension README. This work
  builds on sidebar/backend-adapter changes already present in the workspace.

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
