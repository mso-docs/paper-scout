# Extension foundation and delivery checklist

## Implemented in Steps 3–4

Load `extension/` unpacked and highlight a passage on an HTTP(S) HTML page.
The toolbar popup captures the selection automatically; **Capture current page**
refreshes it. Without a selection it still shows the first heading and metadata.
Use the three-position slider to preview Highlight only, Paragraph (default),
or Section. The saved default is configured in Settings.

Capture uses the selection's common ancestor so expanded context must contain
both endpoints. Paragraph requires an enclosing `<p>`. Section prefers the
nearest enclosing `<section>`, falling back to `<div>`. Missing ancestors,
cross-paragraph selections, and contexts over 24,000 characters fall back to
highlight only with a visible warning. Highlights over 8,000 characters are
rejected; claims are never silently truncated. Whitespace is normalized.

Paper metadata includes title, URL, DOI, arXiv ID, authors, and abstract when
available. Abstract extraction uses citation/DC metadata or explicit abstract
DOM containers, never generic SEO descriptions. Metadata is best effort; a
landing page is not full-paper content. The abstract is visible under Page metadata.

`content.js` performs on-demand top-frame DOM extraction; `popup.mjs` renders
plain text. Captures/results remain in popup memory and clear on close. Settings
use local/session storage. Capturing or changing context makes no network request;
the existing Investigate action sends only on explicit click. Protected browser
pages, local files, PDFs, editable fields, frames and shadow roots are unsupported.

## Current capture contract

The client already assembles `{ highlight, contextRange, context, pageMetadata }`
with `schemaVersion` and capture timestamp/requested-range/warnings. On fallback,
`contextRange` describes the actual context; `capture.requestedRange` records the
slider choice. See the existing [backend handoff](../extension/BACKEND_HANDOFF.md)
for the exact contract. Step 4 does not change API routes, transport, schema,
or backend code. Agreement and integration with Ruben's backend remain pending.

## Remaining MVP work and acceptance criteria

These are required for the product MVP; they are not provided by the popup demo.

- [x] **Claim capture (Step 4):** preserve the selection when opening UI;
  capture highlight, paragraph (default), or section context. Define fallbacks
  for missing ancestors, selections spanning elements, and excessively large
  containers. Preview the actual context and never silently change the claim.
- [ ] **Paper identification (Steps 4, 13):** capture title, abstract, DOI/arXiv
  ID where available, with URL provenance. Verify representative pages from
  arXiv, Semantic Scholar, OpenAlex, and Hugging Face; distinguish abstract and
  model/dataset landing pages from full papers.
- [ ] **HTML content (Step 13):** extract usable HTML paper text;
  set size/time limits and handle extraction
  failures. Indicate when only an abstract or partial content is available.
  Do not present heading capture as full-paper capture.
- [ ] **Backend and provider access (Steps 5–7, 10–11):** validate requests,
  keep credentials server-side, implement per-provider throttles, and document
  the local extension-to-backend connection and allowed origins. Handle
  timeout, cancellation, partial provider failure, and empty results.
- [ ] **Evidence contract (Steps 7–8):** reconcile Step 7's draft two-list
  response with the business-logic categories: supports, contradicts,
  qualifies, related, and insufficient evidence. Return source links and
  clearly distinguish source claims from generated synthesis.
- [ ] **Sidebar and claim trigger (Steps 8–9):** add a background worker,
  selection context menu, and sidebar when needed. Standardize the action
  label (README uses “Investigate Claim”; Step 9 uses “Scout this claim”).
  Preserve the originating tab/URL and keep results associated with the right
  paper across navigation and tab switches. Include loading, retry, and error UI.
- [ ] **Paper chat (Steps 13–15):** grounded answers and explicit “not present”
  responses, conversation history, and a shared sidebar mode switch. Define
  history transport and reset behavior when the paper changes.
- [ ] **End-to-end acceptance (Steps 9, 15):** investigate a highlighted claim
  and open supporting/contradicting/qualifying/related sources; ask a grounded
  question on one supported HTML paper. Verify
  empty evidence, unavailable backend, and extraction failure states.

## Stretch goal: PDFs

- [ ] Attempt Step 12 only after the HTML MVP works and if implementation
  effort fits the available time. Capture browser-accessible PDF bytes,
  extract text server-side, and feed the existing claim/chat pipeline.
- [ ] If implemented, verify the full flow on a real PDF plus size limits,
  extraction failure, and browser access restrictions. PDF support does not
  block MVP acceptance; otherwise keep the explanatory unsupported-PDF UI.

## After the MVP

- [ ] Add further publishers and explicit handling of embedded frames, shadow
  DOM, and complex site layouts based on observed capture failures.
- [ ] Add chunking/embedding retrieval when full paper text exceeds the model's
  input budget; define truncation and citation provenance before shipping it.
- [ ] Evaluate scanned-PDF OCR and layout-aware table/multicolumn extraction.
- [ ] Prepare store packaging, permission/privacy disclosures, and broader
  accessibility/browser testing before public distribution.

Accounts, reference managers, collaboration, citation graphs, and the other
“Do Not Build Yet” features in `business-logic.md` remain outside the MVP.

## Verification

Run the dependency-free behavior checks with Node.js 20+:

```sh
node --test extension/tests/*.test.cjs extension/tests/*.test.mjs
```

Run the disposable Chromium smoke check with Node.js 22+ and recent Chromium:

```sh
node extension/tests/browser-smoke.mjs
node extension/tests/browser-smoke.mjs --real-papers
```

The first checks the real toolbar/selection, all three slider positions, context
fallbacks, settings, safe rendering, cancellation and stale-page rejection using
a local API test double. The second additionally captures live arXiv abstract and
HTML paper pages, checking metadata and complete highlight containment at every
range level. No real backend or LLM is called.

Verified 2026-09-12: all 14 behavior tests and both browser commands passed.
Live pages were `https://arxiv.org/abs/1706.03762` (Attention Is All You Need)
and `https://arxiv.org/html/2401.04088v1` (Mixtral of Experts). Both returned
paper titles, abstracts, arXiv IDs, and intact highlights at all three ranges.
The abstract page has no enclosing paragraph and correctly warns/falls back;
the HTML paper provides both paragraph and section context. Broader checks on
Semantic Scholar, OpenAlex and Hugging Face remain future provider coverage.

The Chrome host-permission dialog
still needs manual verification in a desktop profile.

For a manual fixture, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory extension/tests
```

Open `http://127.0.0.1:8000/fixture.html`. Select the bold claim: Paragraph must
include the trial caveat, Section the population limitation, and Highlight only
exactly the claim. Select across paragraphs to check the visible fallback; select
the text outside a paragraph to check the div fallback. Use arrow keys on the
slider and confirm its announced range matches the preview. Also check a missing
heading, no selection, a protected page, and a PDF. Reload the extension after edits.
