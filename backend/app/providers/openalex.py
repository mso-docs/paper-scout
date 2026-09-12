"""OpenAlex provider integration (docs/integrations.md, "2. OpenAlex").

Requires an API key per the MVP's env var list (`OPENALEX_API_KEY`), sent
as the `api_key` query param when `settings.openalex_api_key` is set.
"""

import re

import httpx

from app.config import settings
from app.providers.base import NormalizedPaper
from app.throttle import throttle

OPENALEX_API_URL = "https://api.openalex.org/works"

_ARXIV_LANDING_RE = re.compile(r"arxiv\.org/abs/([^/?#]+)", re.IGNORECASE)


def _reconstruct_abstract(inverted_index: dict | None) -> str | None:
    """OpenAlex gives abstracts as {word: [position, ...]}. Rebuild the
    plain-text abstract from that inverted index.
    """
    if not inverted_index:
        return None
    positions: dict[int, str] = {}
    max_pos = -1
    for word, idxs in inverted_index.items():
        for idx in idxs:
            positions[idx] = word
            max_pos = max(max_pos, idx)
    if max_pos < 0:
        return None
    return " ".join(positions.get(i, "") for i in range(max_pos + 1)).strip() or None


def _extract_doi(raw_doi: str | None) -> str | None:
    if not raw_doi:
        return None
    return raw_doi.removeprefix("https://doi.org/")


def _extract_arxiv_id(work: dict) -> str | None:
    for location_key in ("primary_location", "best_oa_location"):
        location = work.get(location_key) or {}
        landing_page_url = location.get("landing_page_url") or ""
        match = _ARXIV_LANDING_RE.search(landing_page_url)
        if match:
            return match.group(1)
    return None


def _parse_work(work: dict) -> NormalizedPaper | None:
    title = work.get("title") or work.get("display_name")
    if not title:
        return None

    authors = [
        (authorship.get("author") or {}).get("display_name")
        for authorship in (work.get("authorships") or [])
        if (authorship.get("author") or {}).get("display_name")
    ]

    primary_location = work.get("primary_location") or {}
    open_access = work.get("open_access") or {}

    return NormalizedPaper(
        title=title,
        authors=authors,
        abstract=_reconstruct_abstract(work.get("abstract_inverted_index")),
        year=work.get("publication_year"),
        doi=_extract_doi(work.get("doi")),
        arxiv_id=_extract_arxiv_id(work),
        url=primary_location.get("landing_page_url") or work.get("id"),
        full_text_url=primary_location.get("pdf_url") or open_access.get("oa_url"),
        citation_count=work.get("cited_by_count"),
        source="openalex",
        provider_id=work.get("id"),
    )


async def search(query: str, limit: int = 5) -> list[NormalizedPaper]:
    """Search OpenAlex for works matching `query`, returning up to `limit`
    normalized results. Fails soft: any network/parsing error returns [].
    """
    params = {
        "search": query,
        "per_page": limit,
    }
    if settings.openalex_api_key:
        params["api_key"] = settings.openalex_api_key

    try:
        await throttle("openalex")
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(OPENALEX_API_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:  # noqa: BLE001 - fail soft, never take down the investigation
        print(f"[openalex] search failed for query={query!r}: {exc!r}")
        return []

    try:
        results = payload.get("results") or []
        papers = []
        for item in results:
            paper = _parse_work(item)
            if paper is not None:
                papers.append(paper)
        return papers[:limit]
    except Exception as exc:  # noqa: BLE001
        print(f"[openalex] failed to parse response for query={query!r}: {exc!r}")
        return []
