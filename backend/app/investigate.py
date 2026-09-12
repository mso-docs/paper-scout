"""Claim Investigator orchestration (plan.md item 7).

Ties together app.providers (search), the throttle/registry each provider
already calls internally, and app.llm (evidence classification) into the
/v1/investigations flow, matching the contract in
extension/BACKEND_HANDOFF.md:

    highlight + context (+ pageMetadata, capture)
        -> search query
        -> concurrent provider search (arXiv, Semantic Scholar, OpenAlex,
           Hugging Face)
        -> dedupe candidates
        -> classify_evidence via Claude
        -> InvestigationResponse (status/summary/supports/contradicts/
           qualifies/related/warnings)

MVP simplification (documented, not accidental): rather than generating
separate support/contradiction/qualification/related-work queries per
docs/business-logic.md section 3, this uses the highlighted text itself as
a single query across all providers. Claude still does the actual
supporting/contradicting/qualifying classification once results come back,
which is where the accuracy matters most.
"""

import asyncio
import re

from app.llm import ai_error_message, classify_evidence
from app.models import EvidenceItem, InvestigationRequest, InvestigationResponse
from app.providers import arxiv, huggingface, openalex, semantic_scholar
from app.providers.base import NormalizedPaper

# Cap how many candidates we hand to the LLM — keeps prompt size, cost, and
# latency bounded even if every provider returns a full page of results.
_MAX_CANDIDATES_FOR_LLM = 12

_LLM_FAILURE_SUMMARY = (
    "Evidence classification is temporarily unavailable — the research "
    "providers were searched, but the summarization step failed."
)


def _dedupe(papers: list[NormalizedPaper]) -> list[NormalizedPaper]:
    """Drop duplicate results returned by more than one provider.

    Priority per docs/integrations.md "Deduplication": DOI, then arXiv ID
    (ignoring version suffix, e.g. v1/v2), then normalized title + year.
    """
    seen: set[tuple] = set()
    result: list[NormalizedPaper] = []
    for paper in papers:
        if paper.doi:
            key = ("doi", paper.doi.strip().lower())
        elif paper.arxiv_id:
            bare_id = re.sub(r"v\d+$", "", paper.arxiv_id.strip().lower())
            key = ("arxiv", bare_id)
        else:
            normalized_title = re.sub(r"\s+", " ", paper.title).strip().lower()
            key = ("title", normalized_title, paper.year)

        if key in seen:
            continue
        seen.add(key)
        result.append(paper)
    return result


def _valid_url(url: str | None) -> bool:
    """The extension client rejects any evidence item whose url isn't an
    absolute http(s) URL without embedded credentials (see api.mjs
    validateInvestigation). Drop items that wouldn't pass that check rather
    than let the whole response be rejected client-side.
    """
    if not url:
        return False
    return bool(re.match(r"^https?://[^@]*$", url)) and "://" in url and "@" not in url


def _coerce_evidence_items(raw_items) -> list[EvidenceItem]:
    """Defensively convert the LLM's raw evidence list into EvidenceItem
    models, skipping anything malformed (missing title, missing/invalid
    url) rather than raising or violating the client's response contract.
    """
    items: list[EvidenceItem] = []
    for raw in raw_items or []:
        if not isinstance(raw, dict):
            continue
        title = raw.get("title")
        url = raw.get("url")
        if not title or not _valid_url(url):
            continue
        explanation = raw.get("why") or raw.get("explanation") or ""
        if not explanation:
            continue
        items.append(EvidenceItem(title=title, url=url, explanation=explanation))
    return items


async def run_investigation(payload: InvestigationRequest) -> InvestigationResponse:
    if payload.ai is not None:
        # Custom OpenAI-compatible AI overrides aren't implemented yet.
        # extension/BACKEND_HANDOFF.md explicitly allows rejecting this for
        # now rather than requiring it — raised in app.main as a 422.
        raise ValueError("custom_ai_not_supported")

    query = payload.highlight.strip()[:300]

    provider_results = await asyncio.gather(
        arxiv.search(query),
        semantic_scholar.search(query),
        openalex.search(query),
        huggingface.search(query),
    )
    candidates = [paper for results in provider_results for paper in results]
    candidates = _dedupe(candidates)[:_MAX_CANDIDATES_FOR_LLM]

    warnings: list[str] = []
    try:
        llm_result = await classify_evidence(
            claim=payload.highlight, context=payload.context, candidates=candidates
        )
    except Exception as exc:  # noqa: BLE001 - a live demo shouldn't 500 on an LLM hiccup
        print(f"[investigate] classify_evidence failed: {type(exc).__name__}")
        llm_result = {
            "summary": _LLM_FAILURE_SUMMARY,
            "supporting": [],
            "contradicting": [],
            "qualifying": [],
            "related": [],
        }
        warnings.append(ai_error_message(exc))

    supports = _coerce_evidence_items(llm_result.get("supporting"))
    contradicts = _coerce_evidence_items(llm_result.get("contradicting"))
    qualifies = _coerce_evidence_items(llm_result.get("qualifying"))
    related = _coerce_evidence_items(llm_result.get("related"))

    has_evidence = any([supports, contradicts, qualifies, related])
    status = "complete" if has_evidence else "insufficient_evidence"

    summary = llm_result.get("summary") or (
        "No supporting, contradicting, qualifying, or related evidence was "
        "found for this claim among the searched sources."
    )

    return InvestigationResponse(
        status=status,
        summary=summary,
        supports=supports,
        contradicts=contradicts,
        qualifies=qualifies,
        related=related,
        warnings=warnings,
    )
