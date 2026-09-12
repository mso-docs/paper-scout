# Ruben: backend handoff for the extension

Status: proposed API v1.0 contract, implemented by the extension client and its
local test double. This document does **not** assert that the real backend has
these endpoints. No backend or Docker files were changed for this milestone.

## Ownership and delivery order

Mackenzie owns `extension/`: page/selection capture, context preview, settings,
request transport, and response rendering. Ruben owns the backend, AI agent,
research-provider integrations, request validation, throttling, and Docker.

Build the HTML flow first. PDFs remain a stretch goal. The current client only
sends claim investigations; the chat contract below is for a later milestone.

Suggested backend sequence:

1. Implement `/health`, auth policy, request/response validation, and the local
   Docker run configuration. Return contract-shaped fixture data during backend
   development only, clearly identified as test data.
2. Implement `/v1/investigations` using backend-managed AI credentials first:
   claim/query generation → scholarly searches → deduplication → evidence
   evaluation → grounded summary and categorized source links.
3. Add provider throttling, deadlines, partial failure and insufficient-evidence
   handling; verify the extension's error states against the real backend.
4. Support opt-in custom OpenAI-compatible AI settings, or reject them explicitly.
5. Coordinate HTML content capture/chat with Mackenzie. No PDF dependency.

## Connection and transport

- Default backend base URL: `http://localhost:8787`. The user may configure HTTPS
  servers and base paths, e.g. `https://research.example/api`. Endpoints append to
  that path: `/api/health`, `/api/v1/investigations`. Do not require redirects or
  add a mandatory trailing slash: the client deliberately rejects redirects.
- `Accept: application/json`; POST also uses `Content-Type: application/json`.
  Successful responses must have an `application/json` content type.
- Optional backend token: `Authorization: Bearer <backendToken>`. This authenticates
  to Paper Scout, **not** to the AI provider. Omit the header when no token is set.
  Document whether a local development deployment permits unauthenticated calls;
  require appropriate authentication for a remote/multi-user deployment.
- Health deadline: 8 seconds. Investigation deadline: 60 seconds including body
  read. No automatic retries. The user can cancel/retry. Client disconnect or
  popup close should cancel pending backend/provider work where supported; an
  aborted fetch does not by itself guarantee server-side cancellation.
- No cookies or browser session credentials are sent. No streaming, polling,
  persistent jobs, or conversation state in this first investigation contract.
- Response limit: 1,000,000 bytes. Send bounded JSON, not full search result dumps.
- Browser requests originate from the extension, never the paper's content script.
  Chrome host access is requested on Save connection for the chosen backend host
  only (scheme/hostname; Chrome permissions do not isolate ports or URL paths).
  See Chrome's [network request documentation](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
  and [optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions).
  If the backend checks `Origin` or configures CORS, allow the development
  `chrome-extension://<extension-id>` explicitly and handle OPTIONS for JSON and
  Authorization. Obtain the ID from `chrome://extensions`; unpacked IDs can vary
  between machines/paths. CORS is not authentication.

## GET /health — implemented client

Return HTTP 200 promptly without calling an LLM or spending provider quota:

```json
{
  "status": "ok",
  "apiVersion": "1.0"
}
```

Both fields are required by the client. Additional fields may describe readiness
but are currently ignored. This verifies reachability/contract compatibility,
not validity of a user's AI key or readiness of all research providers. If auth
is configured, accept the backend Bearer token here too.

## POST /v1/investigations — implemented client

Example capture request (without custom AI overrides):

```json
{
  "schemaVersion": "1.0",
  "highlight": "the intervention improved recall",
  "contextRange": "paragraph",
  "context": "In this small study, the intervention improved recall after one week. Larger trials are still needed.",
  "pageMetadata": {
    "title": "A paper about reliable research",
    "url": "https://example.org/paper",
    "abstract": "A study of recall.",
    "doi": "10.1234/example",
    "arxivId": null,
    "authors": ["Example Researcher"]
  },
  "capture": {
    "capturedAt": "2026-09-12T18:00:00.000Z",
    "requestedRange": "paragraph",
    "warnings": []
  }
}
```

Required validation and semantics:

| Field | Contract |
| --- | --- |
| `schemaVersion` | Literal `"1.0"`; reject unsupported versions. |
| `highlight` | Non-empty selected claim, maximum 8,000 characters. |
| `contextRange` | Actual supplied range: `highlight`, `paragraph`, or `section`. |
| `context` | Non-empty text, maximum 24,000 characters; must include the complete normalized highlight. |
| `pageMetadata.url` | Actual HTTP(S) source URL, not an inferred canonical URL. Treat as provenance, not authorization to fetch arbitrary URLs. Set a backend URL-length/body limit and return a validation error when exceeded. |
| `pageMetadata.title` | String up to 500 characters or null. Metadata title preferred over document title and first heading. |
| `pageMetadata.abstract` | String up to 12,000 characters or null. May come from generic description metadata and may be partial; not verified full paper text. |
| `pageMetadata.doi` | DOI-shaped string up to 500 characters or null; not resolved/verified. |
| `pageMetadata.arxivId` | URL-derived identifier or null; may include a version. |
| `pageMetadata.authors` | Up to 100 strings of at most 200 characters; empty when unavailable. |
| `capture.capturedAt` | ISO timestamp for the immutable preview snapshot. |
| `capture.requestedRange` | User's requested range using the same enum. |
| `capture.warnings` | Empty or a visible context-fallback warning. |

The client collapses whitespace in selected text and context, rejects empty and
editable-field selections, and never clips an oversized highlight. It snapshots
all three ranges while the page selection is available. A missing paragraph,
selection spanning paragraphs, or oversized context falls back to the exact
normalized highlight. For that request `contextRange` is `highlight`, while
`capture.requestedRange` retains the user's original choice. Section capture
uses a containing `<section>` or, failing that, `<div>`; never the whole document.

All page content and metadata are untrusted input. Treat instructions in papers
as data, not agent/system instructions. Validate again on the backend. The
extension does not establish whether the selected text is actually a research
claim; the agent should report insufficient evidence or explain an unsuitable
selection rather than manufacture a conclusion.

### Optional custom AI configuration

When **Use my own AI server/model** is enabled, the client adds this field to the
same investigation JSON body:

```json
{
  "ai": {
    "baseUrl": "https://my-ai-server.example/v1",
    "model": "my-model",
    "apiKey": "user-provided-key"
  }
}
```

- Absent `ai`: use Ruben's server-managed provider/model/credentials (including
  Claude, if that is the configured default). Do not require a client key.
- Present `ai`: `baseUrl` and `model` are required. `apiKey` is optional for an
  unauthenticated local server. This v1 override means an **OpenAI-compatible
  chat-completions API**, not an arbitrary raw Anthropic or other native API.
  The backend adapter should call the configured base path's `/chat/completions`
  endpoint. Additional native-provider adapters require an agreed contract change.
- API key maximum: 4,096 characters, one line; model maximum: 200 characters.
  Reject incomplete settings; don't silently replace a requested model/provider.
- The override configures the LLM only. Ruben's research-provider keys, provider
  registry and scholarly searches remain backend concerns.
- Authenticate/authorize custom overrides. Use an operator-configured allowlist
  for AI origins, ports, models, and any explicitly permitted local destinations.
  Reject unsupported/disallowed overrides with 403 or 422. Do not let a remotely
  exposed backend become an arbitrary proxy to internal/metadata services; validate
  resolved addresses and redirect destinations as well as the submitted URL.
- Never log, return, or persist user API keys/request Authorization. Use a request
  scoped AI client so concurrent users cannot leak keys or mutate global defaults.
  Avoid cross-user caches keyed only by model. The key is sent only to the chosen
  backend and its authorized AI provider, not the research sites.
- The settings UI explains this forwarding. Keys default to `chrome.storage.session`;
  optional remembered keys use unsynced local storage (not encrypted). Storage is
  restricted to trusted extension contexts. JSON previews exclude all keys.
  See Chrome's [storage access levels](https://developer.chrome.com/docs/extensions/reference/api/storage).

### Successful investigation response

Return HTTP 200 for both completed investigations and insufficient evidence:

```json
{
  "schemaVersion": "1.0",
  "status": "complete",
  "summary": "The available evidence supports a limited effect; broader generalization is uncertain.",
  "supports": [
    {
      "title": "Example recall study",
      "url": "https://example.org/study",
      "explanation": "Reports improved recall under similar conditions."
    }
  ],
  "contradicts": [],
  "qualifies": [],
  "related": [],
  "warnings": []
}
```

The four category names follow `docs/business-logic.md`; this supersedes the
older plan's draft `supporting`/`conflicting` two-list shape for this client.
Ruben should confirm the contract before real API integration; there is no
claim here that an existing endpoint uses these names.

All fields above are required, including empty category arrays and warnings.
`status` must be `complete` or `insufficient_evidence`. `summary` is non-empty
plain text, at most 20,000 characters. Each category has at most 50 sources;
source `title` is non-empty, at most 1,000 characters, `explanation` is non-empty,
at most 10,000, and `url` must be absolute HTTP(S) without embedded credentials.
Warnings: up to 20 strings of at most 2,000 characters. Extra fields are currently
ignored. Return text, not HTML or Markdown-dependent formatting.

`complete` requires at least one source across the categories. With no useful
evidence, return `insufficient_evidence`, empty arrays, and an honest explanation.
That status may also include limited/related evidence if uncertainty remains.
Do not infer contradiction from failure to find supporting papers.

Provider partial failure should keep usable evidence and describe limitations
in `warnings` without leaking credentials or raw provider errors. Research only
within the bounded MVP sources, deduplicate by identifiers, preserve source URLs,
evaluate evidence from abstracts/text rather than titles alone, and distinguish
what the original claim, external papers, and agent synthesis each say.

### Error responses

Suggested consistent envelope for backend logs and future client detail:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "A safe human-readable explanation.",
    "requestId": "server-generated-correlation-id"
  }
}
```

The current client intentionally displays its own status-based messages instead
of raw error bodies. Do not put secrets in either the envelope or validation
responses (including reflected invalid `ai.apiKey` input).

| HTTP status | Expected meaning / current UI |
| --- | --- |
| 401 | Missing/invalid backend authentication; asks user to check backend token. |
| 403 | Disallowed access or custom AI destination/policy. |
| 404 | Endpoint not implemented or wrong base path. |
| 413 | Input exceeds backend size limits. |
| 422 | Invalid schema/fields or unsupported AI override. |
| 429 | Rate limited; user retries later. May supply Retry-After for future client support. |
| 503 | Required AI/search services unavailable. |
| Other non-2xx | Generic HTTP failure; no raw error-body display. |

Timeouts, connection refusal, redirect rejection, malformed/incompatible JSON,
and oversized responses are displayed by the client as failures with retry
available. Do not return fake research results to make a health check pass.

## Docker/local development requirements (Ruben)

- Expose port 8787 to the developer's host. Listen on the appropriate container
  interface so the mapped port is reachable. Document the backend base URL,
  authentication settings, required env vars and the single startup command.
- Keep server-managed AI/search secrets in backend env/config, outside extension
  assets. The extension works without any AI keys until a user sends a request.
- Document HTTPS deployment or a local loopback development URL. The extension
  rejects plain HTTP for remote backend hosts.
- For an AI model running on the host, a URL such as
  `http://host.docker.internal:11434/v1` must resolve **inside the container**.
  Configure the needed host mapping on Linux and explicitly allow that origin
  in the custom-AI policy. `localhost` inside Docker points to the container.
- Implement outbound provider-specific rate limiting and a bounded request queue;
  respect each provider's current published limits. Extension concurrency is not
  a substitute for backend throttling across clients/users.
- Coordinate health/auth and a real HTML claim smoke check with Mackenzie.
  Frontend tests below use an in-memory API double, not the actual AI agent.

## Future chat contract — not called by this extension yet

Proposed `POST /v1/chat`, using the same auth, versioning and optional `ai` field:

```json
{
  "schemaVersion": "1.0",
  "question": "What are the limitations?",
  "pageContent": "Extracted HTML paper text…",
  "pageMetadata": { "title": "Paper", "url": "https://example.org/paper", "abstract": null, "doi": null, "arxivId": null, "authors": [] }
}
```

Proposed response:

```json
{
  "schemaVersion": "1.0",
  "answer": "The paper identifies a small sample as a limitation.",
  "grounded": true,
  "warnings": []
}
```

Return `grounded: false` with an explicit “not present” explanation when the
answer is unavailable. Use only supplied paper content by default; no silent
external research. Agree question/content size limits, model context budgets,
partial-abstract behavior, and history semantics before implementation. First
version can be independent Q&A; do not assume the server remembers previous
questions. Mackenzie still needs HTML full-text capture, chat UI, and sidebar
state. Oversized text needs an explicit rejection/retrieval policy, not silent
truncation. PDF extraction/highlight mapping is separate stretch work.

## Joint acceptance checklist

- [ ] Health succeeds from the loaded extension at the documented local URL.
- [ ] Optional backend token works; wrong token produces 401 without secret echoes.
- [ ] Default backend AI config accepts a claim without any client AI override.
- [ ] Paragraph/section and explicit highlight fallback arrive unchanged.
- [ ] Valid results render in all four categories and source links open correctly.
- [ ] Empty/weak research uses insufficient evidence; partial failures show warnings.
- [ ] Invalid inputs, unreachable providers, rate limits, timeout and cancel tested.
- [ ] Custom AI override is supported with per-request isolation, or explicitly rejected.
- [ ] Host AI connectivity from Docker is documented and tested if custom local AI is enabled.
- [ ] Real HTML paper investigation passes end to end. PDFs do not block completion.

For frontend-only validation, see `extension/README.md` and
`extension/tests/browser-smoke.mjs`. Share this document with Ruben; no message
has been sent automatically.
