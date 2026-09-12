# Paper Scout

**Chat with Paper explains what’s inside the paper. Claim Investigator investigates what’s outside it.**

Paper Scout is a browser-based research companion that helps researchers critically read papers without leaving the page — ask questions grounded in the paper you're reading, or investigate a highlighted claim against the wider literature.

Our project for AI Tinkerers Atlanta 2026.

## The MVP

Paper Scout has two modes.

### Claim Investigator

**Highlight a claim → “Investigate Claim” → agent researches → evidence appears in a browser sidebar.**

1. Highlight a claim or passage in the paper you’re reading.
2. Select **“Investigate Claim”** to start an investigation.
3. Paper Scout captures the highlight plus a configurable amount of surrounding context (highlight only / paragraph / section) and generates targeted research queries.
4. The agent searches scholarly sources, classifies results as supporting, contradicting, qualifying, or related, and returns a concise summary with sources in a browser sidebar.

### Chat with Paper

**Open Paper Scout → ask a question about the paper → get a grounded answer.**

1. Open Paper Scout on a supported research paper (HTML page).
2. Ask a question, e.g. “What are the main findings?” or “What methodology did the authors use?”
3. Paper Scout retrieves the paper's content and answers using only that content, saying so if the answer isn't present rather than guessing.

*PDF support is a stretch goal — the prototype targets HTML paper pages first.*

## Why Paper Scout?

Paper Scout lives where research happens—the browser. Researchers can investigate a claim or ask about the paper in context, with the paper and the answer side by side, without copying passages into a separate AI application.

## MVP scope

- Claim selection from highlighted text, with a configurable context range (highlight only / paragraph / section).
- Context-aware research using the surrounding page.
- Search across scholarly providers (see [`docs/integrations.md`](docs/integrations.md)), with results classified as supporting, contradicting, qualifying, or related.
- Chat with Paper: grounded Q&A over the current paper's content (HTML pages; PDF is a stretch goal).
- Concise results in a browser sidebar.

Browser-accessible PDF support is a stretch goal if time and implementation complexity allow; it does not block the HTML MVP.

## Status

Step 3's extension foundation is implemented: capture the first heading, page title, and URL from an HTML page in a toolbar popup. Claim context capture, research, PDFs, and paper chat are still planned. See [`docs/plan.md`](docs/plan.md) and the [extension MVP checklist](docs/extension.md) for remaining work, [`docs/business-logic.md`](docs/business-logic.md) for product behavior, and [`docs/integrations.md`](docs/integrations.md) for backend details.

## Run the extension locally

1. Open `chrome://extensions` in Chrome or Chromium and enable **Developer mode**.
2. Click **Load unpacked** and select this repository's `extension/` directory (the folder containing `manifest.json`). No install, build, API keys, or backend is needed.
3. Pin **Paper Scout** from the browser's extensions menu.
4. Open an HTML page, click the Paper Scout toolbar icon, then **Capture current page**.
5. Read the first heading, page title, and URL in the popup. Pages without a heading show an explicit message.

Captures stay in the popup until it closes; nothing is saved or sent to a server. PDF capture and protected browser pages aren't supported in this preview. Try a paper's HTML or abstract page first.

After editing extension files, click **Reload** on its card in `chrome://extensions`, then reopen the popup. For debugging, right-click the popup and choose **Inspect**, or check the extension card's **Errors** panel.

Run `node --test extension/tests/*.test.cjs` with Node.js 20+ for automated checks. See [verification instructions](docs/extension.md#verification) for a local test page and real-page smoke checks.

## License

[MIT](LICENSE)
