"""Hugging Face Papers provider integration (docs/integrations.md, "3.
Hugging Face Papers").

Supplements the broader scholarly indexes for AI/ML-focused claims. Uses
Hugging Face's papers search endpoint; HF papers are themselves indexed
arXiv preprints, so the HF paper id doubles as the arxiv_id.
"""

import httpx

from app.config import settings
from app.providers.base import NormalizedPaper
from app.throttle import throttle

HUGGINGFACE_API_URL = "https://huggingface.co/api/papers/search"


def _parse_paper(item: dict) -> NormalizedPaper | None:
    # The search endpoint sometimes nests paper fields under a "paper" key
    # (alongside HF-specific fields like upvotes/comments), and sometimes
    # returns the paper fields at the top level. Handle both.
    paper = item.get("paper") if isinstance(item.get("paper"), dict) else item

    title = paper.get("title")
    if not title:
        return None

    authors = [
        author.get("name")
        for author in (paper.get("authors") or [])
        if isinstance(author, dict) and author.get("name")
    ]

    published_at = paper.get("publishedAt")
    year = None
    if published_at and isinstance(published_at, str) and len(published_at) >= 4:
        try:
            year = int(published_at[:4])
        except ValueError:
            year = None

    paper_id = paper.get("id")

    return NormalizedPaper(
        title=title,
        authors=authors,
        abstract=paper.get("summary"),
        year=year,
        doi=None,
        arxiv_id=paper_id,
        url=f"https://huggingface.co/papers/{paper_id}" if paper_id else None,
        full_text_url=f"https://arxiv.org/pdf/{paper_id}" if paper_id else None,
        citation_count=None,
        source="huggingface",
        provider_id=paper_id,
    )


async def search(query: str, limit: int = 5) -> list[NormalizedPaper]:
    """Search Hugging Face Papers for papers matching `query`, returning up
    to `limit` normalized results. Fails soft: any network/parsing error
    returns [].
    """
    params = {"q": query}
    headers = {}
    if settings.huggingface_api_key:
        headers["Authorization"] = f"Bearer {settings.huggingface_api_key}"

    try:
        await throttle("huggingface")
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(
                HUGGINGFACE_API_URL, params=params, headers=headers
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:  # noqa: BLE001 - fail soft, never take down the investigation
        print(f"[huggingface] search failed for query={query!r}: {exc!r}")
        return []

    try:
        results = payload if isinstance(payload, list) else payload.get("results") or []
        papers = []
        for item in results:
            paper = _parse_paper(item)
            if paper is not None:
                papers.append(paper)
        return papers[:limit]
    except Exception as exc:  # noqa: BLE001
        print(f"[huggingface] failed to parse response for query={query!r}: {exc!r}")
        return []
