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

1. Open Paper Scout on a supported research paper — an HTML page or a browser-accessible PDF.
2. Ask a question, e.g. “What are the main findings?” or “What methodology did the authors use?”
3. Paper Scout retrieves the paper's content and answers using only that content, saying so if the answer isn't present rather than guessing.

## Why Paper Scout?

Paper Scout lives where research happens—the browser. Researchers can investigate a claim or ask about the paper in context, with the paper and the answer side by side, without copying passages into a separate AI application.

## MVP scope

- Claim selection from highlighted text, with a configurable context range (highlight only / paragraph / section).
- Context-aware research using the surrounding page.
- Search across scholarly providers (see [`docs/integrations.md`](docs/integrations.md)), with results classified as supporting, contradicting, qualifying, or related.
- Chat with Paper: grounded Q&A over the current paper's content, including browser-accessible PDFs.
- Concise results in a browser sidebar.

## Status

This repository currently documents the MVP concept and technical plan — see [`docs/plan.md`](docs/plan.md) (checklist), [`docs/business-logic.md`](docs/business-logic.md) (product/business logic), and [`docs/integrations.md`](docs/integrations.md) (API/tech-stack details). Implementation is underway.

## License

[MIT](LICENSE)
