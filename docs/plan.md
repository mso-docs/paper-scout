# Paper Scout — Getting Started Plan

## 1. Research paper sites

List the sites Paper Scout should recognize/support for context and searching.

- [ ] arXiv (arxiv.org)
- [ ] Semantic Scholar (semanticscholar.org)
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
- [ ] OpenAlex (openalex.org)
- [ ] Hugging Face (huggingface.co) — for model/dataset papers rather than
      general research sites
- [ ] Trim list down to MVP launch targets (pick 2-3 to support first)

## 2. Mission statement

Nail down what Paper Scout actually is/does, beyond the README draft.

- [ ] Review current README MVP description as a starting draft
- [ ] Define target user (e.g., researchers, students, journalists fact-checking papers)
- [ ] Define the core problem being solved (verifying claims without leaving the paper)
- [ ] Write a 1-2 sentence mission statement
- [ ] Confirm scope boundaries (what Paper Scout explicitly does NOT do for MVP)
- [ ] Update README.md with finalized mission statement

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

- [ ] Stand up a minimal backend service (e.g. small Node/Python API) that
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
- [ ] Add a `.env.example` documenting required environment variables
- [ ] Document the run process in README: `docker compose up` (or `docker
      build` + `docker run`) to get the backend running locally
- [ ] Verify the extension can talk to the containerized backend end-to-end
