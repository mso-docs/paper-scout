"""Provider-selected AI calls for evidence classification and grounded paper Q&A.

Uses raw HTTPX requests to OpenAI Responses or Anthropic Messages. Provider
errors and malformed output become safe, actionable warnings at the API boundary.
"""

import json

import httpx

from app.config import settings
from app.providers.base import NormalizedPaper
from app.throttle import throttle

ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

# LLM calls are much slower than typical REST calls (the model has to read a
# claim/paper plus several candidate abstracts, or an entire paper's full
# text, and generate a structured response) — use a generous timeout so we
# don't time out mid-response on longer inputs.
_REQUEST_TIMEOUT_S = 60.0

_MAX_TOKENS = 2048

_NO_CANDIDATES_RESULT: dict = {
    "summary": "No candidate papers were found to evaluate.",
    "supporting": [],
    "contradicting": [],
    "qualifying": [],
    "related": [],
}


class AIError(Exception):
    """An actionable message safe to display without exposing provider payloads."""


def ai_error_message(exc: Exception) -> str:
    if isinstance(exc, AIError):
        return str(exc)
    return "The AI request failed unexpectedly. Check the backend logs and try again."


def _headers() -> dict:
    return {
        "x-api-key": settings.anthropic_api_key or "",
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }


def _extract_text(response_json: dict) -> str:
    """Concatenate the text of every text block in a Messages API response.

    Claude's response `content` is a list of blocks; for a plain-text (no
    tool use) request it's normally a single `{"type": "text", ...}` block,
    but we join all text blocks defensively in case there's more than one.
    """
    blocks = response_json.get("content", [])
    return "".join(
        block.get("text", "") for block in blocks if block.get("type") == "text"
    )


async def _call_claude(system: str, user_message: str) -> str:
    """POST a single-turn request to the Claude Messages API and return the
    raw text of the response (not yet parsed as JSON).

    Raises on transport/HTTP errors (`httpx.HTTPError`); callers are
    responsible for catching JSON-parsing failures of the returned text.
    """
    await throttle("anthropic")

    payload = {
        "model": settings.anthropic_model,
        "max_tokens": _MAX_TOKENS,
        "system": system,
        "messages": [{"role": "user", "content": user_message}],
    }

    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_S) as client:
        response = await client.post(
            ANTHROPIC_MESSAGES_URL, headers=_headers(), json=payload
        )
        response.raise_for_status()
        return _extract_text(response.json())


async def _call_openai(system: str, user_message: str) -> str:
    await throttle("openai")
    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_S) as client:
        response = await client.post(
            OPENAI_RESPONSES_URL,
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={
                "model": settings.openai_model,
                "instructions": system,
                "input": user_message,
                "max_output_tokens": _MAX_TOKENS,
                "store": False,
                "text": {"format": {"type": "json_object"}},
            },
        )
        response.raise_for_status()
        data = response.json()
    if data.get("status") != "completed":
        raise AIError(
            "OpenAI returned an incomplete answer. Try a shorter question or paper."
        )
    parts = []
    for item in data.get("output", []):
        if item.get("type") != "message":
            continue
        for block in item.get("content", []):
            if block.get("type") == "refusal":
                raise AIError(
                    "OpenAI declined this request. Try rephrasing the question."
                )
            if block.get("type") == "output_text":
                parts.append(block.get("text", ""))
    return "".join(parts)


async def _call_model(system: str, user_message: str) -> str:
    provider = settings.llm_provider
    if provider not in {"openai", "anthropic"}:
        raise AIError("Set LLM_PROVIDER to openai or anthropic in backend/.env.")
    label = "OpenAI" if provider == "openai" else "Anthropic"
    key = getattr(settings, f"{provider}_api_key")
    if not key or not key.strip():
        raise AIError(
            f"Set {provider.upper()}_API_KEY in backend/.env and restart the backend."
        )
    try:
        if provider == "openai":
            return await _call_openai(system, user_message)
        return await _call_claude(system, user_message)
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        messages = {
            401: "rejected the API key. Check the key in backend/.env and restart the backend.",
            403: "denied access. Check your project permissions and model access.",
            404: "could not find the model. Check the configured model name and access.",
            429: "hit a rate or quota limit. Check API billing/limits, then retry.",
            400: "rejected the request. Check model compatibility and paper length.",
        }
        detail = messages.get(status, "is temporarily unavailable. Try again shortly.")
        raise AIError(f"{label} {detail}") from None
    except httpx.TimeoutException:
        raise AIError(
            f"{label} timed out. Try again or use a shorter paper."
        ) from None
    except httpx.RequestError:
        raise AIError(
            f"Could not connect to {label}. Check the backend network."
        ) from None
    except (ValueError, TypeError, AttributeError):
        raise AIError(
            f"{label} returned an invalid response. Try again."
        ) from None


def _parse_result(text: str, *, chat: bool = False) -> dict:
    try:
        result = json.loads(text)
        if not isinstance(result, dict):
            raise TypeError
        if chat:
            if (
                not isinstance(result.get("answer"), str)
                or not result["answer"].strip()
            ):
                raise ValueError
            if type(result.get("grounded")) is not bool:
                raise ValueError
        else:
            if (
                not isinstance(result.get("summary"), str)
                or not result["summary"].strip()
            ):
                raise ValueError
            for category in ("supporting", "contradicting", "qualifying", "related"):
                if not isinstance(result.get(category), list):
                    raise TypeError
                for item in result[category]:
                    if not isinstance(item, dict) or any(
                        not isinstance(item.get(field), str)
                        for field in ("title", "url", "why")
                    ):
                        raise ValueError
        return result
    except (ValueError, TypeError):
        raise AIError(
            "The AI returned a malformed answer. Try the request again."
        ) from None


def _format_candidate(index: int, paper: NormalizedPaper) -> str:
    authors = ", ".join(paper.authors) if paper.authors else "Unknown authors"
    year = paper.year if paper.year is not None else "Unknown year"
    abstract = paper.abstract or "(no abstract available)"
    url = paper.url or paper.full_text_url or "(no url available)"
    return (
        f"[{index}] Title: {paper.title}\n"
        f"    Authors: {authors}\n"
        f"    Year: {year}\n"
        f"    URL: {url}\n"
        f"    Abstract: {abstract}"
    )


async def classify_evidence(
    claim: str, context: str, candidates: list[NormalizedPaper]
) -> dict:
    """Classify candidate papers as evidence for/against a highlighted claim.

    Implements docs/business-logic.md "6. Evidence Classification": each
    candidate is sorted into exactly one of supporting / contradicting /
    qualifying / related, or left out entirely if it doesn't bear on the
    claim. Returns a dict:

        {
            "summary": str,
            "supporting": [{"title": ..., "url": ..., "why": ...}, ...],
            "contradicting": [...],
            "qualifying": [...],
            "related": [...],
        }

    If `candidates` is empty, no API call is made at all — this is the
    "handle empty/low-quality search results gracefully" behavior — and a
    dict indicating no evidence was found is returned immediately.

    Invalid output raises AIError for the orchestration layer to display.
    """
    if not candidates:
        return dict(_NO_CANDIDATES_RESULT)

    candidates_block = "\n\n".join(
        _format_candidate(i, paper) for i, paper in enumerate(candidates, start=1)
    )

    system = (
        "You are Paper Scout's Claim Investigator. You evaluate candidate "
        "research papers against a claim a researcher highlighted while "
        "reading, and classify each candidate as evidence that supports, "
        "contradicts, qualifies/limits, or is merely related to the claim.\n\n"
        "Rules you must follow:\n"
        "- You may ONLY discuss the candidate papers explicitly listed in "
        "the user message. Never invent, assume, or reference any paper, "
        "author, finding, or URL that was not given to you.\n"
        "- Classify each candidate into exactly one category: "
        '"supporting" (directly consistent with the claim), '
        '"contradicting" (directly challenges the claim or reports a '
        "conflicting result), "
        '"qualifying" (the claim holds only under narrower conditions, '
        "depends on a variable, or has a methodological limitation), or "
        '"related" (does not directly test the claim but is useful '
        "adjacent evidence, an alternative method, background, or "
        "follow-up work).\n"
        "- If a candidate does not bear on the claim at all, leave it out "
        "of every category entirely — do not force an irrelevant paper "
        "into one of the four buckets.\n"
        "- Do not classify a paper from its title alone; use the abstract "
        "and metadata you were given.\n"
        "- Citation count may be a weak ranking signal but must not "
        "dominate relevance; do not discard recent, low-citation papers "
        "just because they are new.\n"
        "- Write a one-sentence 'why it matters' for each classified "
        "paper, explaining its bearing on the claim.\n"
        "- Write a concise overall summary of the investigation.\n"
        "- If none of the candidates provide meaningful evidence, say so "
        "plainly in the summary and leave the category lists empty rather "
        "than forcing weak matches.\n\n"
        "Respond with STRICT JSON only — no prose before or after the "
        "JSON, no markdown code fences. The JSON must match exactly this "
        "shape:\n"
        "{\n"
        '  "summary": "...",\n'
        '  "supporting": [{"title": "...", "url": "...", "why": "..."}],\n'
        '  "contradicting": [{"title": "...", "url": "...", "why": "..."}],\n'
        '  "qualifying": [{"title": "...", "url": "...", "why": "..."}],\n'
        '  "related": [{"title": "...", "url": "...", "why": "..."}]\n'
        "}\n"
        'Use "title" and "url" exactly as given for each candidate you '
        "reference. Any category with no matching candidates should be an "
        "empty list."
    )

    user_message = (
        f"Highlighted claim:\n{claim}\n\n"
        f"Surrounding context:\n{context}\n\n"
        f"Candidate papers:\n{candidates_block}\n\n"
        "Classify these candidates per your instructions and respond with "
        "the JSON object only."
    )

    text = await _call_model(system, user_message)

    return _parse_result(text)


async def answer_question(
    question: str, page_content: str, page_metadata: dict
) -> dict:
    """Answer a question about the paper currently being read, grounded only
    in that paper's text.

    Implements "Chat with Paper Business Logic" sections 3-5: the question
    is answered using only `page_content` (the extracted text of the
    current paper); if the answer isn't present, Claude is instructed to say
    so explicitly rather than guess. Returns a dict: `{"answer": str,
    "grounded": bool}`, where `grounded` is False whenever Claude could not
    answer from the paper's content.

    NOTE on context size: per the plan's MVP decision, `page_content` is
    passed through in full rather than chunked/truncated here. Very long
    papers could approach the model's context window along with the system
    prompt and `max_tokens`; if that becomes a real problem, chunking/
    retrieval (business-logic.md "Chat with Paper" §4, "Retrieve Relevant
    Paper Context") would need to be implemented upstream of this function,
    not inside it.

    Invalid output raises AIError for the orchestration layer to display.
    """
    system = (
        "You are Paper Scout's Chat with Paper assistant. You answer a "
        "researcher's question about the paper they are currently reading, "
        "using ONLY the paper text you are given as your source of truth.\n\n"
        "Rules you must follow:\n"
        "- Base your answer strictly on the provided paper content. Do not "
        "use outside knowledge, other papers, or assumptions about what the "
        "paper 'probably' says.\n"
        "- If the requested information is not present in the paper, say so "
        "explicitly rather than inferring or guessing an answer.\n"
        "- Be concise and directly responsive to the question.\n\n"
        "Respond with STRICT JSON only — no prose before or after the "
        "JSON, no markdown code fences. The JSON must match exactly this "
        "shape:\n"
        "{\n"
        '  "answer": "...",\n'
        '  "grounded": true or false\n'
        "}\n"
        '"grounded" must be false whenever you could not answer the '
        'question from the paper\'s content (in that case, "answer" '
        "should explain that the paper doesn't contain this information), "
        "and true whenever your answer is actually drawn from the paper."
    )

    metadata_block = json.dumps(page_metadata, indent=2) if page_metadata else "{}"

    user_message = (
        f"Question:\n{question}\n\n"
        f"Paper metadata:\n{metadata_block}\n\n"
        f"Paper content:\n{page_content}\n\n"
        "Answer the question per your instructions and respond with the "
        "JSON object only."
    )

    text = await _call_model(system, user_message)

    return _parse_result(text, chat=True)
