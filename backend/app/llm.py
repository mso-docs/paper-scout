"""Claude API integration for Paper Scout.

This module is the only place in the backend that talks to Anthropic's
Claude API. It implements the two LLM-driven business-logic steps described
in docs/business-logic.md:

- `classify_evidence` — "6. Evidence Classification" (Claim Investigator):
  given a claim, its surrounding context, and a list of candidate papers
  found by the research providers, ask Claude to sort each candidate into
  supporting / contradicting / qualifying / related (or silently drop it if
  it's irrelevant), with a one-sentence "why it matters" for each and an
  overall summary.
- `answer_question` — "Chat with Paper Business Logic" sections 3-5: given a
  question and the full text of the paper currently being read, ask Claude
  to answer using only that text, and to say so explicitly if the answer
  isn't in the paper rather than guessing.

Calls are made via raw HTTP (`httpx`) directly against
`POST https://api.anthropic.com/v1/messages`, per this module's design (the
rest of the backend's provider clients are being built independently, and
this module intentionally has no dependency on the `anthropic` Python SDK).

Every call is preceded by `await throttle("anthropic")` so Claude API usage
respects the shared per-source rate limit in `app.rate_limits`.

Both public functions are defensive about the model's output: Claude is
instructed to respond with strict JSON, but if it ever returns something
that isn't valid JSON (extra prose, truncation, etc.) we catch the parse
failure and return a safe fallback dict rather than raising — a malformed
LLM response should degrade the feature, not crash the request.
"""

import json
import os

import httpx

from app.config import settings
from app.providers.base import NormalizedPaper
from app.throttle import throttle

ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")

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

_CLASSIFY_PARSE_FAILURE_RESULT: dict = {
    "summary": "Unable to parse evidence classification.",
    "supporting": [],
    "contradicting": [],
    "qualifying": [],
    "related": [],
}

_ANSWER_PARSE_FAILURE_RESULT: dict = {
    "answer": "Something went wrong answering this question.",
    "grounded": False,
}


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
        "model": ANTHROPIC_MODEL,
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

    If Claude's response can't be parsed as JSON, a safe fallback dict with
    empty categories is returned instead of raising, so a malformed LLM
    response degrades the feature rather than crashing the request.
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

    text = await _call_claude(system, user_message)

    try:
        result = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return dict(_CLASSIFY_PARSE_FAILURE_RESULT)

    if not isinstance(result, dict):
        return dict(_CLASSIFY_PARSE_FAILURE_RESULT)

    return result


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

    If Claude's response can't be parsed as JSON, a safe fallback dict is
    returned instead of raising.
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
        "question from the paper's content (in that case, \"answer\" "
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

    text = await _call_claude(system, user_message)

    try:
        result = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return dict(_ANSWER_PARSE_FAILURE_RESULT)

    if not isinstance(result, dict):
        return dict(_ANSWER_PARSE_FAILURE_RESULT)

    return result
