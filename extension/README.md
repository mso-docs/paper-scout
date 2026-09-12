# Paper Scout extension · 0.2.0

This milestone is entirely inside `extension/`. It adds HTML highlight capture,
context previews, connection settings, and a client for the proposed Paper Scout
investigation API. Ruben owns the real backend and Docker. The implementation
contract and backend checklist are in [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md).

## Try it

1. Open `chrome://extensions`, enable Developer mode, and load this `extension/`
   folder unpacked (or Reload its card if already installed). There is no build.
2. Open an HTML paper, highlight a passage, then click Paper Scout's toolbar icon.
3. The popup automatically captures the selection. Choose Highlight only,
   Paragraph (default), or Section using the slider and review the exact context to send.
4. Open Settings, enter a Paper Scout backend base URL, and Save connection.
   Accept Chrome's access prompt for that host. `http://localhost:8787` is the
   default; the backend need not be running to save settings or preview claims.
5. Optionally supply the backend access token. Leave custom AI off to use the
   backend's configuration. If supported by the backend, enable custom AI and
   enter an OpenAI-compatible base URL, model, and optional key.
6. Test saved connection when the backend is running. Return to Capture and
   click Investigate Claim to send the preview. The UI shows categorized
   evidence, insufficient evidence, or an actionable connection/API error.

The AI URL/key are forwarded to the chosen **Paper Scout backend** when custom
AI is enabled. This is not a direct generic chat client for any provider API.
Health checks verify only the backend contract, not model credentials/readiness.
Unsaved settings do not affect Test saved connection or investigations.

Keys last for the browser session by default; remembered keys use local,
unencrypted, unsynced extension storage. Clear keys deletes both stored copies.
Settings persist locally. Captures/results are in popup memory only. Closing
it clears them and cancels a pending client request; server-side work needs the
backend's disconnect/cancellation support. Nothing is sent by merely capturing
or switching context ranges. Capture JSON previews contain no keys.

## Implemented and remaining extension work

- [x] Top-frame HTML selection capture, paragraph/section choices and previews.
- [x] Metadata hints: citation title/authors/DOI, URL arXiv ID, explicit paper abstract metadata/DOM (generic descriptions are excluded).
- [x] Visible fallback for missing/cross-paragraph/oversized context; never send
  an implicitly clipped claim or an entire document as surrounding context.
- [x] Saved backend URL/token, default context, optional AI URL/model/key settings.
- [x] Optional backend-host access, trusted-context key storage, clear-key action.
- [x] Versioned claim payload, health test, timeout/cancel/error handling, and
  supports/contradicts/qualifies/related response rendering in the popup.
- [ ] Confirm the proposed API contract with Ruben and test against his real agent.
- [ ] Verify metadata/context quality on representative arXiv, Semantic Scholar,
  OpenAlex and Hugging Face HTML pages. A generic description is not necessarily
  the paper abstract; the first heading may be a subject category.
- [ ] Sidebar + selection context menu + background worker for durable capture,
  requests and results when the popup closes; preserve source tab/URL identity.
- [ ] Full HTML paper extraction, partial-content indicators, chat UI and requests.
- [ ] Agree conversation/history, context budget and backend retry semantics.
- [ ] Revoke obsolete optional host grants through a future connection manager;
  currently use Chrome's extension Site access controls to remove old grants.
- [ ] PDF support only as a stretch goal; OCR, frames and shadow-root capture later.

Selection limits: 8,000 characters, context 24,000. Whitespace is normalized.
Paragraph requires a single enclosing `<p>` containing the selection. Section
uses the common ancestor's closest `<section>`, then `<div>`; missing/oversized
containers fall back visibly to highlight only. Editable fields, PDFs, local
files, protected browser pages, multiple selections and embedded-frame selections
are not supported. Metadata is best effort, not verified bibliographic truth.
If the source URL changes before sending, recapture is required. A same-URL DOM
change does not mutate an already reviewed snapshot; use Capture current page
to refresh it.

## Files

- `content.js`: isolated on-demand DOM extraction. No credentials or networking.
- `popup.html`, `popup.css`, `popup.mjs`: capture/settings views and result UI.
- `settings.mjs`: URL validation and local/session storage.
- `api.mjs`: payload assembly, backend requests and response validation.
- `BACKEND_HANDOFF.md`: exact implemented API contract and proposed future chat API.
- `tests/`: behavior tests, HTML fixture and disposable-browser smoke check.

No production mock mode, dependencies, background worker, or backend changes
are included. Steps 3–4 status and verification are documented in the shared plan and README.

## Checks

Dependency-free behavior tests (Node 20+):

```sh
node --test extension/tests/capture.test.cjs extension/tests/api.test.mjs
```

Real browser smoke check (Node 22+ and recent Chromium with
`Extensions.triggerAction` DevTools support):

```sh
node extension/tests/browser-smoke.mjs
# Also verify two live arXiv pages (network required):
node extension/tests/browser-smoke.mjs --real-papers
```

Set `CHROMIUM=/path/to/chromium` if needed. This creates a disposable profile,
serves a local HTML fixture and in-memory API double, and cleans up the profile.
It tests the real toolbar selection, DOM context, settings storage, HTTP
health/investigation requests and result/error UI. It pregrants only the local
test server through Chromium's extension management API; manually verify the
normal Chrome permission dialog separately. It never calls an LLM or real backend.
Screenshots are written to the system temp directory as `paper-scout-settings.png`
and `paper-scout-capture.png`.

Manual fixture:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory extension/tests
```

Open `http://127.0.0.1:8000/fixture.html`. Select the bold claim and verify that
Paragraph includes the trial-size caveat and Section includes the population
limitation. Select across the two paragraphs and verify the explicit paragraph
fallback; select outside a paragraph and verify the div context option. Check
that no selection disables Investigate, settings survive reopening, and Clear
keys removes saved/session keys. Test a denied host prompt, wrong token,
unreachable backend and unsupported PDF. Inspect the popup and extension Errors
panel for unexpected errors. Real backend integration remains a joint checklist
in the handoff document.
