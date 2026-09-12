# Paper Scout — Getting Started Plan

**Prototype scope:** HTML paper pages only. PDF support (item 12) is a
**stretch goal** — deprioritized so we have a working end-to-end demo as
fast as possible; pick it up only if there's time left after the core flow
works.

**Ownership:**

- **Extension** (items 3, 4, 8, 9, 14, 15) — Mackenzie
- **Backend + Docker** (items 5, 6, 7, 10, 11, 13) — Ruben

## 1. Research paper sites

List the sites Paper Scout should recognize/support for context and searching.

- [x] arXiv (arxiv.org) — selected for MVP, see `docs/integrations.md`
- [x] Semantic Scholar (semanticscholar.org) — selected for MVP
- [ ] PubMed / PubMed Central (pubmed.ncbi.nlm.nih.gov)
- [ ] Google Scholar (scholar.google.com)
- [ ] SSRN (ssrn.com)
- [ ] bioRxiv / medRxiv (biorxiv.org, medrxiv.org)
- [ ] ACL Anthology (aclanthology.org)
- [ ] IEEE Xplore (ieeexplore.ieee.org)
- [ ] ACM Digital Library (dl.acm.org)
- [ ] Springer / Nature (link.springer.com, nature.com)
- [ ] ScienceDirect (sciencedirect.com)
- [ ] OpenReview (openreview.net)
- [x] OpenAlex (openalex.org) — selected for MVP
- [x] Hugging Face (huggingface.co) — selected for MVP, for model/dataset
      papers rather than general research sites
- [x] Trim list down to MVP launch targets — arXiv, Semantic Scholar,
      OpenAlex, Hugging Face (+ DuckDuckGo as supplemental web fallback,
      see `docs/integrations.md`)

## 2. Mission statement

Nail down what Paper Scout actually is/does, beyond the README draft.

- [x] Review current README MVP description as a starting draft
- [x] Define target user (researchers critically reading a paper — see
      `docs/business-logic.md` Overview)
- [x] Define the core problem being solved (Chat with Paper explains what's
      inside the paper; Claim Investigator investigates what's outside it)
- [x] Write a 1-2 sentence mission statement
- [x] Confirm scope boundaries (see `docs/business-logic.md` → MVP Scope →
      "Do Not Build Yet")
- [x] Update README.md with finalized mission statement

## 3. Chrome extension bare bones

**Owner: Mackenzie (Extension)**

Stand up a minimal working extension as a technical foundation.

- [x] Create `extension/` directory with `manifest.json` (Manifest V3)
- [x] Add basic extension icon(s) and metadata (name, description, version)
- [x] Implement content script to scrape the current page
- [x] Content script grabs the page's `<h1>` tag text
- [x] Wire up a way to trigger the scrape (toolbar button click or popup)
- [x] Return/display the scraped `<h1>` text (popup UI or console log for now)
- [x] Load extension unpacked in Chrome/Chromium and verify it works on a real page
      (Chromium 152 headless: real toolbar action, local fixture, arXiv abstract page)
- [x] Document how to load/run the extension locally in README

Implemented as a dependency-free popup with a **Capture current page** button.
`content.js` captures the first heading plus `{ title, url }` page metadata;
`popup.mjs` handles browser access and renders the result as text. Missing or
empty headings are explicit, with no title substitution. Captures are temporary
and make no network requests. The current extension also uses `storage` for connection preferences and
optional host access for explicit backend requests. See [`extension.md`](extension.md) for the capture contract,
verification instructions, MVP acceptance checklist, and deferred work.

Step 3 is complete. Step 4 now adds selection capture below; full paper content
for Chat with Paper remains separate work.

## 4. Claim capture: highlight + surrounding context

**Owner: Mackenzie (Extension)**

Design decision: capture the user's highlighted claim as the focus, but always
attach a context window around it — not the raw highlight alone, and not the
whole page. Whole-page analysis would force the agent to first guess which
sentences are even worth checking (noisy, expensive); a bare highlight risks
losing meaning if it references something defined earlier ("this effect",
"the same dataset"). A context window around the highlight fixes that without
the cost of analyzing an entire paper.

- [x] Add a context-range slider to the popup/sidebar UI with three levels
      (default: **Paragraph**):
  - [x] **Highlight Only** — just the selected text, no expansion
  - [x] **Paragraph** — walk up from the highlight to its enclosing `<p>` tag
  - [x] **Section** — walk up from the highlight to the first outer
        `<section>`, falling back to the first outer `<div>` if no
        `<section>` ancestor exists
- [x] Implement DOM logic to walk up from the highlighted selection to the
      target ancestor for each range level
- [x] Capture paper-level metadata when available (title, abstract, DOI/URL)
- [x] Decide the payload shape sent to the backend: `{ highlight,
      contextRange, context, pageMetadata }`
- [x] Test against a couple of real paper pages to confirm each range level
      produces sane, non-misleading context
      (2026-09-12: arXiv Attention Is All You Need abstract and Mixtral of Experts HTML;
      all three ranges preserve the claim, with explicit paragraph fallback on the abstract page)

The existing versioned extension payload remains unchanged; see
[`extension/BACKEND_HANDOFF.md`](../extension/BACKEND_HANDOFF.md). This records
the client contract, not backend agreement. Backend integration remains Ruben’s
work. Missing, cross-paragraph, or oversized contexts fall back to the full
highlight with a visible warning. Captures never silently clip a claim.

## 5. API rate limiting

**Owner: Ruben (Backend)**

The research agent must throttle outgoing requests (paper-search APIs, LLM
calls) rather than firing them as fast as possible. Real published limits are
far below a flat 100-200 req/sec and vary a lot by service:

- arXiv: max 1 request per 3 seconds (~0.33 req/sec) — arXiv explicitly asks
  for this and can throttle/block heavier use
- Semantic Scholar: 1 req/sec with an API key (standard tier)
- Claude API (Anthropic): Tier 1 = 50 requests/minute (~0.83 req/sec), scales
  with account tier

- [ ] Add a rate-limit slider to the settings UI: range **1–60 requests/min**,
      default **20 requests/min** (~0.33 req/sec, matched to arXiv's limit as
      the most restrictive dependency) — UI slider itself is an Extension
      task, not yet built; the backend throttle below doesn't need a slider
      to function, it just isn't user-configurable yet
- [x] Implement a request throttle/queue in the agent so it waits between
      requests according to the configured rate (`backend/app/throttle.py`)
- [x] Make the configured rate limit apply per outgoing API call, not just at
      the start of an investigation — every provider/LLM call does
      `await throttle(source)` individually, not once per investigation
- [x] Test that the throttle actually delays requests as expected — verified
      with real timing: 5 sequential `throttle("arxiv")` calls measured
      ~3.003s apart (expected 3.000s), and concurrent callers to the same
      source correctly serialize instead of racing past each other

## 6. Per-source rate-limit registry

**Owner: Ruben (Backend)**

Every research paper site (item 1) has its own published rate limit, so
throttling can't be one hardcoded number baked into the request code. Track
limits in a single config/registry that the shared throttle reads from,
instead of scattering rate-limit logic across each integration.

- [x] Create a `rateLimits` config with one entry per source, normalized as
      `{ requests, interval_ms }` (`backend/app/rate_limits.py`)
- [x] Seed it with arXiv (`1 / 3000ms`), Semantic Scholar (`1 / 1000ms`),
      OpenAlex (`10 / 1000ms`, polite pool), Hugging Face (`10 / 10000ms`),
      and Claude API (`50 / 60000ms`, Tier 1)
- [x] Point the shared throttle/queue (item 5) at this registry, keyed by
      source name, instead of using a single global rate
- [x] Document the process for adding a new source (module docstring in
      `rate_limits.py`: look up the limit, add one entry — no throttle code
      changes needed)
- [ ] Revisit/add entries whenever item 1's site list changes (ongoing —
      not a one-time task)

## 7. Backend agent pipeline

**Owner: Ruben (Backend)**

The actual core of the product: turn a captured claim + context into a
supporting/conflicting evidence summary. This is the piece none of the
earlier items build yet.

- [x] Stand up the backend service (Python/FastAPI — see item 11); `POST
      /investigate` accepts `{ highlight, context_range, context,
      page_metadata }` (`backend/app/main.py`, `app/investigate.py`)
- [x] Turn the claim into one or more search queries — **MVP
      simplification**: uses the highlighted text itself as a single query
      across all providers, rather than generating separate support/
      contradiction/qualification queries per business-logic.md §3. Claude
      still does the real classification work once results come back;
      multi-intent query generation is a documented upgrade path, not
      required for a working prototype
- [x] Call the paper-search API(s) chosen from item 1 (arXiv, Semantic
      Scholar, OpenAlex, Hugging Face — run concurrently via
      `asyncio.gather`), through the throttle/registry built in items 5-6
- [x] Call an LLM (Claude API) with the claim + retrieved abstracts, asking
      it to sort results into supporting / contradicting / qualifying /
      related (`backend/app/llm.py::classify_evidence`)
- [x] Generate a concise summary with links back to each source
- [x] Define the response shape sent back to the extension: `{ summary,
      supporting, contradicting, qualifying, related }`
      (`backend/app/models.py`)
- [x] Handle empty/low-quality search results gracefully (no evidence
      found) — verified live: with every provider failing (rate-limited/
      unauthenticated in testing) the endpoint still returns `200` with a
      "temporarily unavailable" summary instead of crashing

## 8. Sidebar UI

**Owner: Mackenzie (Extension)**

Render the agent's results where the README's MVP says they should appear —
a browser sidebar, not just a popup.

- [ ] Build a sidebar UI (`chrome.sidePanel` API) separate from the h1-demo
      popup in item 3
- [ ] Show a loading state while the backend investigates
- [ ] Render the summary plus supporting/conflicting evidence sections with
      source links
- [ ] Handle and display error states (backend unreachable, no results)

## 9. End-to-end wiring: "Scout this claim" trigger

**Owner: Mackenzie (Extension — depends on the backend from item 7 being
callable)**

Connect the pieces: highlight → context capture → backend call → sidebar
result, matching the README's MVP flow.

- [ ] Add a context-menu item ("Scout this claim") that appears on text
      selection
- [ ] On click, capture context per item 4's slider setting and send the
      request to the backend from item 7
- [ ] Open/populate the sidebar (item 8) with the response
- [ ] Walk through the full flow on a real paper page to confirm it works
      end-to-end

## 10. Local backend: Docker container

**Owner: Ruben (Backend + Docker)**

Make the backend (item 7) runnable locally with one command, so anyone on
the team (or judges) can stand it up without configuring a local environment
by hand.

- [x] Write a `Dockerfile` for the backend service
- [x] Write a `docker-compose.yml` covering env vars via `env_file: .env`
- [x] Expose the backend on a fixed local port the extension can call
      (`8787`)
- [x] Add a `.env.example` documenting required environment variables
      (`backend/.env.example`)
- [x] Document the run process in README
- [ ] Verify the extension can talk to the containerized backend
      end-to-end — **not verified**: this sandbox has no `docker` binary,
      so `docker build`/`docker compose up` couldn't actually be run here,
      and the extension doesn't exist yet either. The backend itself *was*
      verified running directly (venv + uvicorn) with real `/health`,
      `/investigate`, and `/chat` calls — someone with Docker and the
      extension needs to confirm the containerized path specifically

## 11. Backend tech stack

**Owner: Ruben (Backend)**

Decision: **Python**, so the same language handles API orchestration, PDF
text extraction, and LLM calls without a second runtime.

- [x] Language: Python
- [x] Web framework: **FastAPI** — verified running (`GET /health`,
      `POST /investigate`, `POST /chat` all confirmed live)
- [x] HTTP client: **httpx** (async, so calls to arXiv/Semantic Scholar/
      OpenAlex/Hugging Face/Claude don't block each other or the throttle
      queue from item 5)
- [x] Schema/validation: **pydantic** for the request/response shapes
      defined in items 4, 7, and 13
- [x] Env loading: **python-dotenv**, reading `backend/.env` (see
      `backend/.env.example`)
- [ ] PDF text extraction: **PyMuPDF** (`fitz`) — see item 12 (stretch
      goal; not needed for the initial prototype)
- [x] Set up root `requirements.txt` and `requirements-dev.txt` pinning the
      agreed runtime and development packages (PDF dependencies deferred)
- [x] Set up `backend/requirements.txt` pinning these
- [x] **Resolved:** root `requirements.txt`/`requirements-dev.txt` is
      canonical. Deleted `backend/requirements.txt`; the Dockerfile's build
      context is now the repo root (`backend/docker-compose.yml`) so it can
      `COPY` the root `requirements.txt` directly.
- [x] Confirm this stack in `docs/integrations.md` (Backend Tech Stack
      section) so it isn't re-decided later

## 12. Browser-accessible PDF support (Stretch Goal)

**Status: deferred.** Not enough time to build this alongside the core
prototype — the initial demo targets HTML paper pages only. Revisit only
if the HTML flow (items 3-11, 13-15) is fully working with time to spare.

There's also open technical risk specific to Claim Investigator on PDFs
(not just Chat with Paper's need for raw text): whether a content script
can detect a highlight *inside* Chrome's built-in PDF viewer at all. That
needs a spike before this item is picked up, not just implementation.

Many papers are viewed as PDFs, not HTML. Chrome's built-in PDF viewer
doesn't expose a normal scrapeable DOM to a content script the way an HTML
page does, so text extraction has to happen server-side on the PDF bytes —
not by scraping the rendered viewer.

- [ ] Detect when the current tab is a PDF (URL ends in `.pdf`, or
      `document.contentType === "application/pdf"`)
- [ ] Extension fetches the PDF bytes itself (using the browser's own
      session/cookies, so paywalled/authenticated PDFs the user can already
      see in-browser still work) rather than having the backend re-fetch
      the URL blind
- [ ] Extension sends the PDF bytes to the backend (e.g. multipart upload)
- [ ] Backend extracts text with **PyMuPDF**; note `pdfplumber` as a
      fallback if layout-aware extraction (tables, columns) is needed later
- [ ] Feed extracted text into the same paper-content pipeline used for
      HTML pages (item 13), so Chat with Paper and Claim Investigator don't
      need separate logic per page type
- [ ] Test against a real arXiv PDF and a real HTML paper page to confirm
      both produce usable text

## 13. Chat with Paper: backend Q&A pipeline

**Owner: Ruben (Backend)**

Mirrors `docs/business-logic.md`'s Chat with Paper flow (identify paper →
retrieve content → interpret question → retrieve relevant context →
generate grounded answer). Prototype targets HTML pages only — see item 12
for PDF, deferred as a stretch goal.

- [ ] Identify the current paper (URL, DOI, arXiv ID, or page metadata) —
      this is fundamentally an Extension/DOM task (item 4); the backend
      just accepts whatever `page_metadata` the extension already
      identified, it doesn't detect anything itself
- [ ] Retrieve paper content: DOM text for HTML pages — same as above, this
      is the Extension's job (item 4's capture logic); the backend receives
      `page_content` as a plain string, it doesn't scrape anything
- [x] Decide the MVP context-retrieval approach: **send the full extracted
      paper text directly as LLM context** rather than building a chunking/
      embedding/vector-search pipeline — Claude's context window comfortably
      fits a full paper, and this avoids scope a hackathon MVP doesn't need
- [x] Note the upgrade path (chunk + embed + vector search) for later, if a
      paper's text ever exceeds the context window
- [x] Call the LLM with the question + full paper text, instructed to
      answer only from that content and say so if the answer isn't present
      (`backend/app/llm.py::answer_question`, wired via `app/chat.py` and
      `POST /chat` — verified live, degrades to a clean non-crashing
      response when the LLM call itself fails)
- [x] Define the request/response shape: `{ question, page_content,
      page_metadata }` → `{ answer, grounded: bool }`

## 14. Chat with Paper: sidebar UI

**Owner: Mackenzie (Extension)**

- [ ] Add a chat interface to the same sidebar built in item 8 (tab or mode
      switch between "Investigate" and "Chat with Paper", not a separate
      panel)
- [ ] Input box for the question, message history for the conversation
- [ ] Loading state while the backend answers
- [ ] Visually distinguish a grounded answer from a "not present in this
      paper" response

## 15. Chat with Paper: end-to-end wiring

**Owner: Mackenzie (Extension — depends on the backend from item 13 being
callable)**

- [ ] Add a way to open Paper Scout / Chat with Paper on the current page
      (toolbar button or sidebar always-available tab — doesn't require a
      highlight, unlike item 9's trigger)
- [ ] On question submit, capture page content per item 13 and send to the
      backend
- [ ] Populate the sidebar (item 14) with the response
- [ ] Walk through the full flow on a real HTML paper to confirm it works
      end-to-end (PDF: stretch goal, see item 12)
