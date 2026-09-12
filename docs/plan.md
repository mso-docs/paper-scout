# Paper Scout — Getting Started Plan

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

Stand up a minimal working extension as a technical foundation.

- [ ] Create `extension/` directory with `manifest.json` (Manifest V3)
- [ ] Add basic extension icon(s) and metadata (name, description, version)
- [ ] Implement content script to scrape the current page
- [ ] Content script grabs the page's `<h1>` tag text
- [ ] Wire up a way to trigger the scrape (toolbar button click or popup)
- [ ] Return/display the scraped `<h1>` text (popup UI or console log for now)
- [ ] Load extension unpacked in Chrome and verify it works on a real page
- [ ] Document how to load/run the extension locally in README

## 4. Claim capture: highlight + surrounding context

Design decision: capture the user's highlighted claim as the focus, but always
attach a context window around it — not the raw highlight alone, and not the
whole page. Whole-page analysis would force the agent to first guess which
sentences are even worth checking (noisy, expensive); a bare highlight risks
losing meaning if it references something defined earlier ("this effect",
"the same dataset"). A context window around the highlight fixes that without
the cost of analyzing an entire paper.

- [ ] Add a context-range slider to the popup/sidebar UI with three levels
      (default: **Paragraph**):
  - [ ] **Highlight Only** — just the selected text, no expansion
  - [ ] **Paragraph** — walk up from the highlight to its enclosing `<p>` tag
  - [ ] **Section** — walk up from the highlight to the first outer
        `<section>`, falling back to the first outer `<div>` if no
        `<section>` ancestor exists
- [ ] Implement DOM logic to walk up from the highlighted selection to the
      target ancestor for each range level
- [ ] Capture paper-level metadata when available (title, abstract, DOI/URL)
- [ ] Decide the payload shape sent to the backend: `{ highlight,
      contextRange, context, pageMetadata }`
- [ ] Test against a couple of real paper pages to confirm each range level
      produces sane, non-misleading context

## 5. API rate limiting

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
      the most restrictive dependency)
- [ ] Implement a request throttle/queue in the agent so it waits between
      requests according to the configured rate
- [ ] Make the configured rate limit apply per outgoing API call, not just at
      the start of an investigation
- [ ] Test that the throttle actually delays requests as expected at both
      ends of the slider

## 6. Per-source rate-limit registry

Every research paper site (item 1) has its own published rate limit, so
throttling can't be one hardcoded number baked into the request code. Track
limits in a single config/registry that the shared throttle reads from,
instead of scattering rate-limit logic across each integration.

- [ ] Create a `rateLimits` config (e.g. `rateLimits.json` or a small module)
      with one entry per source, normalized as `{ requests, intervalMs }`
      (handles per-second, per-minute, whatever the source publishes)
- [ ] Seed it with the sources already researched: arXiv (`1 / 3000ms`),
      Semantic Scholar (`1 / 1000ms`), Claude API (`50 / 60000ms`, Tier 1)
- [ ] Point the shared throttle/queue (item 5) at this registry, keyed by
      source name, instead of using a single global rate
- [ ] Document the process for adding a new source: look up its published
      rate limit, add one entry to the registry — no throttle code changes
      needed
- [ ] Revisit/add entries whenever item 1's site list changes

## 7. Backend agent pipeline

The actual core of the product: turn a captured claim + context into a
supporting/conflicting evidence summary. This is the piece none of the
earlier items build yet.

- [ ] Stand up the backend service (Python/FastAPI — see item 11) that
      accepts `{ highlight, contextRange, context, pageMetadata }`
- [ ] Turn the claim into one or more search queries
- [ ] Call the paper-search API(s) chosen from item 1, through the throttle/
      registry built in items 5-6
- [ ] Call an LLM (Claude API) with the claim + retrieved abstracts, asking
      it to sort results into supporting / conflicting / unclear
- [ ] Generate a concise summary with links back to each source
- [ ] Define the response shape sent back to the extension: `{ summary,
      supporting: [...], conflicting: [...] }`
- [ ] Handle empty/low-quality search results gracefully (no evidence found)

## 8. Sidebar UI

Render the agent's results where the README's MVP says they should appear —
a browser sidebar, not just a popup.

- [ ] Build a sidebar UI (`chrome.sidePanel` API) separate from the h1-demo
      popup in item 3
- [ ] Show a loading state while the backend investigates
- [ ] Render the summary plus supporting/conflicting evidence sections with
      source links
- [ ] Handle and display error states (backend unreachable, no results)

## 9. End-to-end wiring: "Scout this claim" trigger

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

Make the backend (item 7) runnable locally with one command, so anyone on
the team (or judges) can stand it up without configuring a local environment
by hand.

- [ ] Write a `Dockerfile` for the backend service
- [ ] Write a `docker-compose.yml` (or equivalent) covering env vars for API
      keys (Claude API, Semantic Scholar, etc.) via a `.env` file
- [ ] Expose the backend on a fixed local port the extension can call (e.g.
      `http://localhost:8787`)
- [x] Add a `.env.example` documenting required environment variables
      (`backend/.env.example`)
- [ ] Document the run process in README: `docker compose up` (or `docker
      build` + `docker run`) to get the backend running locally
- [ ] Verify the extension can talk to the containerized backend end-to-end

## 11. Backend tech stack

Decision: **Python**, so the same language handles API orchestration, PDF
text extraction, and LLM calls without a second runtime.

- [x] Language: Python
- [ ] Web framework: **FastAPI** — async support matters here since the
      backend fans out to multiple rate-limited external APIs (item 6);
      also gets request/response validation and OpenAPI docs for free
- [ ] HTTP client: **httpx** (async, so calls to arXiv/Semantic Scholar/
      OpenAlex/Hugging Face/Claude don't block each other or the throttle
      queue from item 5)
- [ ] Schema/validation: **pydantic** for the request/response shapes
      defined in items 4, 7, and 13
- [ ] Env loading: **python-dotenv**, reading `backend/.env` (see
      `backend/.env.example`)
- [ ] PDF text extraction: **PyMuPDF** (`fitz`) — see item 12
- [ ] Set up `backend/pyproject.toml` (or `requirements.txt`) pinning these
- [x] Confirm this stack in `docs/integrations.md` (Backend Tech Stack
      section) so it isn't re-decided later

## 12. Browser-accessible PDF support

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

Mirrors `docs/business-logic.md`'s Chat with Paper flow (identify paper →
retrieve content → interpret question → retrieve relevant context →
generate grounded answer).

- [ ] Identify the current paper (URL, DOI, arXiv ID, or page metadata)
- [ ] Retrieve paper content: DOM text for HTML pages, extracted text for
      PDFs (item 12)
- [x] Decide the MVP context-retrieval approach: **send the full extracted
      paper text directly as LLM context** rather than building a chunking/
      embedding/vector-search pipeline — Claude's context window comfortably
      fits a full paper, and this avoids scope a hackathon MVP doesn't need
- [x] Note the upgrade path (chunk + embed + vector search) for later, if a
      paper's text ever exceeds the context window
- [ ] Call the LLM with the question + full paper text, instructed to
      answer only from that content and say so if the answer isn't present
- [x] Define the request/response shape: `{ question, pageContent,
      pageMetadata }` → `{ answer, grounded: bool }`

## 14. Chat with Paper: sidebar UI

- [ ] Add a chat interface to the same sidebar built in item 8 (tab or mode
      switch between "Investigate" and "Chat with Paper", not a separate
      panel)
- [ ] Input box for the question, message history for the conversation
- [ ] Loading state while the backend answers
- [ ] Visually distinguish a grounded answer from a "not present in this
      paper" response

## 15. Chat with Paper: end-to-end wiring

- [ ] Add a way to open Paper Scout / Chat with Paper on the current page
      (toolbar button or sidebar always-available tab — doesn't require a
      highlight, unlike item 9's trigger)
- [ ] On question submit, capture page content per item 12/13 and send to
      the backend
- [ ] Populate the sidebar (item 14) with the response
- [ ] Walk through the full flow on a real HTML paper and a real PDF to
      confirm both work end-to-end
