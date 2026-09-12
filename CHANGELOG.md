# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project has not yet had a versioned release; everything so far is
tracked under [Unreleased].

## [Unreleased]

### Added

- Manifest V3 extension foundation with toolbar popup, on-demand first-heading
  capture, page title/URL, icons, and missing-heading/unsupported-page handling.
- Dependency-free capture behavior tests, a local HTML fixture, unpacked loading
  instructions, and an extension delivery checklist covering the remaining MVP
  and deferred work.

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

### Changed

- Made HTML papers the required MVP path and PDF support a stretch goal;
  retained the PDF implementation plan without blocking MVP acceptance.

- Consolidated two divergent `.env.example` files (a root-level one listing
  OpenAlex/Hugging Face, and a `backend/`-scoped one listing Claude/Semantic
  Scholar) into a single `backend/.env.example` covering all four services.
- Added OpenAlex and Hugging Face to `plan.md`'s candidate research-site list
  to reflect that consolidation.

### Removed

- Root-level `.env.example` (superseded by `backend/.env.example`).
