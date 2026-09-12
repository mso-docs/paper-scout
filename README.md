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

Steps 3–4 provide HTML claim capture and metadata in the toolbar popup. Steps 8, 14, and 15 add a shared Investigate / Chat with Paper sidebar wired to the implemented backend (`POST /v1/investigations`, `POST /v1/chat`). Open **Open sidebar / Chat with Paper** from the popup, save the backend connection, then capture a claim or ask a question without highlighting. Sidebar behavior is verified in Chromium; the live arXiv-to-backend request worked, but successful live AI verification awaits valid Anthropic credentials (the current configuration returned 401). The Step 9 context-menu trigger remains planned. See [`docs/plan.md`](docs/plan.md) and [extension documentation](extension/README.md).

## Getting started

Install **Python 3.14**, then open a terminal in the `paper-scout` repository
folder. The `.python-version` file records the shared Python version.

Python packages are listed in [`requirements.txt`](requirements.txt). For
development, install [`requirements-dev.txt`](requirements-dev.txt), which
includes all of those packages plus testing and linting tools. You do not need
to install both files separately. The `-r` option tells pip to read the package
list from the file.

### Install with pip

Create a virtual environment (`.venv`) to keep this project's packages separate
from other Python projects, then install the requirements:

macOS / Linux:

```sh
python3.14 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
python -m pip check
```

Windows PowerShell (activation is optional; these commands use the environment directly):

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pip check
```

Select `.venv` as your editor's Python interpreter. If your Linux distribution
packages `venv` separately, install its Python 3.14 venv package first.

To install only the runtime packages, replace `requirements-dev.txt` with
`requirements.txt` in the install command above.

### Install with uv (optional)

If you already use uv, you can use the same requirements files:

```sh
uv venv --python 3.14
uv pip install -r requirements-dev.txt
uv pip check
```

Use either the pip or uv setup. Both developers should use Python 3.14 and the
committed requirements files; they do not need to use the same installer.

### Configuration and dependency updates

- [`requirements.txt`](requirements.txt): FastAPI, Uvicorn, HTTPX, Pydantic,
  and python-dotenv, matching the agreed backend stack.
- [`requirements-dev.txt`](requirements-dev.txt): includes runtime dependencies
  plus pytest, pytest-asyncio, and Ruff. Use this file on both development machines.
- For a runtime-only environment, install with `python -m pip install -r requirements.txt`.

Copy `backend/.env.example` to `backend/.env` if it does not already exist, then
fill in your own credentials. Never overwrite a configured `.env` or commit keys.
Virtual environments and Python tool caches are ignored by Git.

When either developer adds a package, add its exact version (`package==version`)
to the appropriate requirements file and commit that change with the code that
needs it. After pulling changes, rerun the install command and `python -m pip check`.
Recreate `.venv` when packages are removed, because pip install does not uninstall
obsolete packages. Avoid replacing these files with a global `pip freeze`.
Direct dependencies are pinned; transitive dependencies are resolved by pip, so
this is not a full lockfile guaranteeing identical dependency trees across machines.

These files cover the agreed stack available in this checkout; add dependencies
from Ruben's unmerged implementation when it is shared. Provider SDKs and PDF
libraries are deferred until the implementation needs them. No backend entrypoint
exists here yet, so server startup instructions will follow Ruben's implementation.
The browser extension remains dependency-free JavaScript and needs no Python build.

## Run the extension locally

1. Open `chrome://extensions` in Chrome or Chromium 116+ and enable **Developer mode**.
2. Click **Load unpacked** and select this repository's `extension/` directory (the folder containing `manifest.json`). No install, build, API keys, or backend is needed.
3. Pin **Paper Scout** from the browser's extensions menu.
4. Open an HTML paper page, highlight a claim, then click the Paper Scout toolbar icon. Capture runs automatically; **Capture current page** refreshes it.
5. Choose **Highlight only**, **Paragraph** (default), or **Section** with the slider. Review the claim, context, fallback warnings, and page metadata. You can also capture page metadata without a selection.

6. Click **Open sidebar / Chat with Paper**. In the sidebar’s Connection settings, save the backend URL (default `http://localhost:8787`) and accept host access. Use **Capture current selection → Investigate claim**, or switch to **Chat with Paper** and submit a question. Run the backend with valid AI credentials for answers.

Captures stay in the popup until it closes. Capture and slider changes send nothing; the sidebar’s **Investigate claim** and **Ask paper** explicitly send to the configured backend. The legacy popup investigation client still uses the proposed `/v1/investigations` endpoint; use the sidebar with this repository’s backend. Connection settings persist locally. PDF capture and protected browser pages aren't supported in this preview. Try a paper's HTML or abstract page first.

After editing extension files, click **Reload** on its card in `chrome://extensions`, then reopen the popup. For debugging, right-click the popup and choose **Inspect**, or check the extension card's **Errors** panel.

Run `node --test extension/tests/*.test.cjs extension/tests/*.test.mjs` with Node.js 20+ for automated checks. See [verification instructions](docs/extension.md#verification) for a local test page and real-page smoke checks.

## Running the backend locally

1. Copy `backend/.env.example` to `backend/.env` and fill in `ANTHROPIC_API_KEY` (required) and any optional provider keys (`SEMANTIC_SCHOLAR_API_KEY`, `OPENALEX_API_KEY`, `HUGGINGFACE_API_KEY`).
2. With Docker:
   ```
   cd backend
   docker compose up --build
   ```
3. Without Docker: set up the shared virtual environment from "Getting started" above (repo-root `.venv`, `requirements.txt`), then run the server from inside `backend/`:
   ```
   source .venv/bin/activate   # from the repo root; .\.venv\Scripts\activate on Windows
   cd backend
   uvicorn app.main:app --host 0.0.0.0 --port 8787 --reload
   ```
4. Check it's up: `curl http://localhost:8787/health` → `{"status": "ok"}`.

## License

[MIT](LICENSE)
