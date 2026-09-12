# Paper Scout extension · 0.3.0

Load `extension/` unpacked in Chrome/Chromium 116+; no build is required.

1. Open an HTML paper and click the Paper Scout toolbar icon.
2. Click **Open sidebar / Chat with Paper**. No highlight is required for chat.
3. Expand Connection settings, save the backend URL (default
   `http://localhost:8787`), and accept Chrome’s host permission prompt.
4. For Investigate, highlight a passage, click **Capture current selection**,
   choose Highlight only / Paragraph / Section, review context, and investigate.
5. For Chat with Paper, enter a question and submit. The sidebar captures the
   current page and sends it to `/v1/chat`, then labels the answer as grounded or
   not established by the paper. Backend failures appear separately as errors.

Start the backend using the root README instructions and configure its
`LLM_PROVIDER` and the corresponding `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. The sidebar uses `/v1/investigations` and `/v1/chat` with versioned camelCase
fields, matching `backend/app/models.py`. The capture/settings popup and sidebar now use the same versioned backend
API. Save connection and accept Chrome’s host prompt before submitting; merely
filling in a URL does not grant access. Custom AI settings
are unsupported by this backend and are rejected by the sidebar; disable them
in popup Settings. Backend tokens and connection preferences are shared.

Capture and mode switches make no network requests. Questions send the visible
HTML content currently loaded on the page, preferring article/main containers,
with title, URL, abstract, and DOI/arXiv ID when available. Navigation controls,
forms, hidden content, and scripts are excluded. Abstract pages only supply the
abstract page; unloaded sections, embedded frames, shadow DOM and PDFs are not
captured. Pages above 200,000 characters and empty extractions fail explicitly;
text is never silently truncated. Selection/context limits remain 8,000/24,000
characters with visible highlight-only fallbacks.

Questions are independent: message history is for display and is not sent as
LLM context. History and results are held only in sidebar memory, clear on
navigation/tab switches or sidebar closure, and can be cleared manually.
Requests support loading, cancellation, timeouts, safe text rendering, and
stale-page rejection. Cancellation stops the client; it does not guarantee that
backend/provider work stops. Reopen the toolbar popup on a newly selected page
to grant activeTab access if Chrome denies capture. Keys are session-only by
default; popup Settings controls remembering and clearing keys.

## Verification

```sh
node --test extension/tests/*.test.cjs extension/tests/*.test.mjs
node extension/tests/browser-smoke.mjs
node extension/tests/sidebar-smoke.mjs
```

Browser checks require Node 22+ and recent Chromium with DevTools
`Extensions.triggerAction` support; set `CHROMIUM` to override its path. They
use disposable profiles and local API doubles, exercise real extension APIs,
and pregrant local host access. Desktop permission-dialog acceptance remains a
manual check. Sidebar checks cover both modes, actual backend payload shapes,
safe/missing source links, no evidence, grounded/ungrounded chat history,
loading/cancellation/errors, navigation reset, and empty/oversized extraction.

For live chat verification, start the actual backend at `127.0.0.1:8788` with
valid credentials for the configured AI provider, then run:

```sh
node extension/tests/sidebar-smoke.mjs --real-backend
```

This loads the live arXiv Mixtral of Experts HTML paper and calls the real AI
through `/v1/chat`. On 2026-09-12, extraction and FastAPI transport worked, but
Anthropic returned 401 with the available configuration. Successful live-answer
acceptance remains unchecked in the plan. The fixture-based browser checks
verify both answer types independently of provider availability.

Step 9’s selection context menu is implemented. Docker verification, PDF support,
broader publisher coverage, and background persistence remain separate work.

## Files

- `content.js`: claim/context and paper metadata capture.
- `paper-content.js`: bounded HTML paper extraction for chat.
- `sidepanel.html`, `sidepanel.css`, `sidepanel.mjs`: shared sidebar UI and lifecycle.
- `backend-api.mjs`: adapter/validation for the implemented backend contract.
- `popup.*`: original capture/settings demo and sidebar entry point.
- `settings.mjs`, `api.mjs`: shared storage, permissions and HTTP transport.
- `BACKEND_HANDOFF.md`: current sidebar contract and legacy API proposal.
