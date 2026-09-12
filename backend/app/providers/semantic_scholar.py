"""Semantic Scholar provider integration (docs/integrations.md, "1. Semantic
Scholar").

Works unauthenticated against Semantic Scholar's public Graph API; if
`settings.semantic_scholar_api_key` is set, it's sent to get the higher,
per-key rate limit instead of sharing the unauthenticated pool.
"""

import httpx

from app.config import settings
from app.providers.base import NormalizedPaper
from app.throttle import throttle

SEMANTIC_SCHOLAR_API_URL = "https://api.semanticscholar.org/graph/v1/paper/search"

_FIELDS = "title,abstract,authors,year,externalIds,citationCount,url,openAccessPdf"


def _parse_paper(paper: dict) -> NormalizedPaper | None:
    title = paper.get("title")
    if not title:
        return None

    authors = [
        author.get("name")
        for author in (paper.get("authors") or [])
        if author.get("name")
    ]

    external_ids = paper.get("externalIds") or {}
    doi = external_ids.get("DOI")
    arxiv_id = external_ids.get("ArXiv")

    open_access_pdf = paper.get("openAccessPdf") or {}
    full_text_url = open_access_pdf.get("url")

    return NormalizedPaper(
        title=title,
        authors=authors,
        abstract=paper.get("abstract"),
        year=paper.get("year"),
        doi=doi,
        arxiv_id=arxiv_id,
        url=paper.get("url"),
        full_text_url=full_text_url,
        citation_count=paper.get("citationCount"),
        source="semantic_scholar",
        provider_id=paper.get("paperId"),
    )


async def search(query: str, limit: int = 5) -> list[NormalizedPaper]:
    """Search Semantic Scholar for papers matching `query`, returning up to
    `limit` normalized results. Fails soft: any network/parsing error, or a
    rate-limited/error response, returns [].
    """
    params = {
        "query": query,
        "limit": limit,
        "fields": _FIELDS,
    }
    headers = {}
    if settings.semantic_scholar_api_key:
        headers["x-api-key"] = settings.semantic_scholar_api_key

    try:
        await throttle("semantic_scholar")
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(
                SEMANTIC_SCHOLAR_API_URL, params=params, headers=headers
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:  # noqa: BLE001 - fail soft, never take down the investigation
        print(f"[semantic_scholar] search failed for query={query!r}: {exc!r}")
        return []

    try:
        results = payload.get("data") or []
        papers = []
        for item in results:
            paper = _parse_paper(item)
            if paper is not None:
                papers.append(paper)
        return papers[:limit]
    except Exception as exc:  # noqa: BLE001
        print(f"[semantic_scholar] failed to parse response for query={query!r}: {exc!r}")
        return []
