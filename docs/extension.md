# Extension foundation and delivery checklist

## Implemented in Step 3

Load `extension/` unpacked, open an HTTP(S) HTML page, open the toolbar popup,
and click **Capture current page**. The popup displays the first `<h1>`'s
normalized text, the document title, and the current URL. An absent or empty
first heading is reported explicitly. Subsequent captures read the current DOM.

There is no build step, backend dependency, automatic browsing capture, or
persistence. Closing the popup discards the result. Chrome internal pages,
local files, protected pages, and PDFs show an explanatory error. Capture is
limited to the top frame's ordinary DOM; nested frames and shadow roots aren't
searched. This is generic HTML heading capture, not verified paper identification
or provider-specific extraction.

`manifest.json` declares the popup, icons, and only `activeTab` / `scripting`
permissions. This follows Chrome's [on-demand injection pattern](https://developer.chrome.com/docs/extensions/get-started/tutorial/scripts-activetab).
`popup.js` obtains the active tab and injects `content.js` into its isolated
world. The script's final expression returns serializable data through
[`scripting.executeScript`](https://developer.chrome.com/docs/extensions/reference/api/scripting).
No background worker is needed for this milestone.

## Current capture contract

```json
{
  "status": "captured",
  "heading": "A paper title",
  "pageMetadata": {
    "title": "Document title",
    "url": "https://example.org/paper"
  }
}
```

`heading` and `pageMetadata.title` are `null` when empty or absent. The heading
is not guaranteed to be the paper title. A PDF detected inside the injected
script returns `{ "status": "unsupported-pdf" }`. The popup also checks PDF
URL suffixes and handles injection rejection from Chrome's protected viewer.
Reliable PDF detection/extraction remains the Step 12 stretch goal.

Keep DOM extraction in `content.js`, separate from UI and transport, as this
grows. Extend `pageMetadata` with validated paper identifiers and metadata in
Step 4. Build explicit claim and chat payloads instead of sending this heading
preview directly to an LLM:

- Claim request: `{ highlight, contextRange, context, pageMetadata }` (Steps 4, 7).
- Chat request: `{ question, pageContent, pageMetadata }` (Steps 12–13).

## Remaining MVP work and acceptance criteria

These are required for the product MVP; they are not provided by the popup demo.

- [ ] **Claim capture (Step 4):** preserve the selection when opening UI;
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

Run the dependency-free behavior checks with Node.js 20 or newer:

```sh
node --test extension/tests/*.test.cjs
```

These test normalization, missing headings, plain-text rendering, repeat
captures, unsupported pages/PDFs, and failure recovery using a mocked Chrome
API. Real Chrome permission and popup behavior also require a browser check.

Verified on 2026-09-12 in an isolated Chromium 152 headless profile with the
unpacked extension: triggered the real toolbar action to grant `activeTab`,
clicked the popup capture button, checked the local fixture and missing-heading
case, then captured the actual first heading and URL on the arXiv abstract page
below. All seven automated behavior tests passed. The manual protected-page
checks below and testing in a normal Chrome desktop profile remain useful
follow-up checks; blocked-page behavior currently also has mocked API coverage.

For a repeatable manual fixture, run from the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory extension/tests
```

1. Load the extension as described in the README. Open
   `http://127.0.0.1:8000/fixture.html` and capture it from the popup.
   Expect **A paper about reliable research**, with the fixture title and URL.
2. Remove both `<h1>` elements through page DevTools and capture again. Expect
   the missing-heading message and intact page metadata.
3. Capture a real HTML paper/abstract page, e.g.
   `https://arxiv.org/abs/1706.03762`. Its first heading currently reads
   **Computer Science > Computation and Language**, rather than the paper
   title. Compare against the first `<h1>` in DevTools if the site changes;
   paper-title extraction is a separate Step 4 task.
4. Try `chrome://extensions`, the Chrome Web Store, and an arXiv PDF. Expect
   an explanatory error and an enabled capture button, with no stale result.
5. Navigate to another HTML page and capture again. Confirm its heading and
   URL replace the previous page. Close/reopen the popup and confirm it starts
   empty. Check the extension's Errors panel for unexpected errors.
