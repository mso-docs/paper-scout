"""Claim Investigator orchestration (plan.md item 7).

Ties together the pieces built independently in app.providers (search),
app.throttle/app.rate_limits (already used internally by each provider),
and app.llm (evidence classification) into the actual /investigate flow:

    claim + context
        -> search query
        -> concurrent provider search (arXiv, Semantic Scholar, OpenAlex,
           Hugging Face)
        -> dedupe candidates
        -> classify_evidence via Claude
        -> InvestigateResponse

MVP simplification (documented, not accidental): rather than generating
separate support/contradiction/qualification/related-work queries per
docs/business-logic.md section 3, this uses the highlighted text itself as
a single query across all providers. That's a real simplification made for
speed — Claude still does the actual supporting/contradicting/qualifying
classification once results come back, which is where the accuracy matters
most. Multi-intent query generation is a documented upgrade path, not
required for a working prototype.
"""

import asyncio
import re

from app.llm import classify_evidence
from app.models import EvidenceItem, InvestigateRequest, InvestigateResponse
from app.providers import arxiv, huggingface, openalex, semantic_scholar
from app.providers.base import NormalizedPaper

# Cap how many candidates we hand to the LLM — keeps prompt size, cost, and
# latency bounded even if every provider returns a full page of results.
_MAX_CANDIDATES_FOR_LLM = 12

_LLM_FAILURE_RESULT: dict = {
    "summary": "Evidence classification is temporarily unavailable — the "
    "research providers were searched, but the summarization step failed.",
    "supporting": [],
    "contradicting": [],
    "qualifying": [],
    "related": [],
}


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


def _coerce_evidence_items(raw_items) -> list[EvidenceItem]:
    """Defensively convert the LLM's raw evidence list into EvidenceItem
    models, skipping anything malformed rather than raising — an LLM
    response with an unexpected shape should degrade the feature, not
    crash the request.
    """
    items: list[EvidenceItem] = []
    for raw in raw_items or []:
        if not isinstance(raw, dict):
            continue
        title = raw.get("title")
        if not title:
            continue
        items.append(
            EvidenceItem(title=title, url=raw.get("url"), why=raw.get("why") or "")
        )
    return items


async def run_investigation(payload: InvestigateRequest) -> InvestigateResponse:
    query = payload.highlight.strip()[:300]

    provider_results = await asyncio.gather(
        arxiv.search(query),
        semantic_scholar.search(query),
        openalex.search(query),
        huggingface.search(query),
    )
    candidates = [paper for results in provider_results for paper in results]
    candidates = _dedupe(candidates)[:_MAX_CANDIDATES_FOR_LLM]

    try:
        llm_result = await classify_evidence(
            claim=payload.highlight, context=payload.context, candidates=candidates
        )
    except Exception as exc:  # noqa: BLE001 - a live demo shouldn't 500 on an LLM hiccup
        print(f"[investigate] classify_evidence failed: {exc}")
        llm_result = dict(_LLM_FAILURE_RESULT)

    return InvestigateResponse(
        summary=llm_result.get("summary", ""),
        supporting=_coerce_evidence_items(llm_result.get("supporting")),
        contradicting=_coerce_evidence_items(llm_result.get("contradicting")),
        qualifying=_coerce_evidence_items(llm_result.get("qualifying")),
        related=_coerce_evidence_items(llm_result.get("related")),
    )
