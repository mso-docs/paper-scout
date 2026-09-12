"""arXiv provider integration (docs/integrations.md, "4. arXiv").

No API key required. Returns preprint metadata parsed from arXiv's Atom
XML feed.
"""

import re
import xml.etree.ElementTree as ET

import httpx

from app.providers.base import NormalizedPaper
from app.throttle import throttle

ARXIV_API_URL = "https://export.arxiv.org/api/query"

_ATOM_NS = "http://www.w3.org/2005/Atom"


def _tag(name: str) -> str:
    return f"{{{_ATOM_NS}}}{name}"


def _extract_arxiv_id(entry_id: str | None) -> str | None:
    """Pull the bare arXiv id (with version) out of an entry's <id> URL,
    e.g. 'http://arxiv.org/abs/2301.12345v2' -> '2301.12345v2'.
    """
    if not entry_id:
        return None
    match = re.search(r"abs/([^/]+)$", entry_id)
    return match.group(1) if match else entry_id


def _extract_year(published: str | None) -> int | None:
    if not published:
        return None
    match = re.match(r"(\d{4})", published)
    return int(match.group(1)) if match else None


def _parse_entry(entry: ET.Element) -> NormalizedPaper | None:
    title_el = entry.find(_tag("title"))
    if title_el is None or not (title_el.text or "").strip():
        return None
    title = " ".join(title_el.text.split())

    summary_el = entry.find(_tag("summary"))
    abstract = " ".join(summary_el.text.split()) if summary_el is not None and summary_el.text else None

    authors = []
    for author_el in entry.findall(_tag("author")):
        name_el = author_el.find(_tag("name"))
        if name_el is not None and name_el.text:
            authors.append(name_el.text.strip())

    entry_id_el = entry.find(_tag("id"))
    entry_id = entry_id_el.text.strip() if entry_id_el is not None and entry_id_el.text else None
    arxiv_id = _extract_arxiv_id(entry_id)

    published_el = entry.find(_tag("published"))
    year = _extract_year(published_el.text if published_el is not None else None)

    # abstract page link (usually the entry id itself) and a PDF link if present.
    url = entry_id
    full_text_url = None
    for link_el in entry.findall(_tag("link")):
        if link_el.get("title") == "pdf" or link_el.get("type") == "application/pdf":
            full_text_url = link_el.get("href")
        elif link_el.get("rel") == "alternate" and not url:
            url = link_el.get("href")

    return NormalizedPaper(
        title=title,
        authors=authors,
        abstract=abstract,
        year=year,
        doi=None,
        arxiv_id=arxiv_id,
        url=url,
        full_text_url=full_text_url,
        citation_count=None,
        source="arxiv",
        provider_id=arxiv_id,
    )


async def search(query: str, limit: int = 5) -> list[NormalizedPaper]:
    """Search arXiv for papers matching `query`, returning up to `limit`
    normalized results. Fails soft: any network/parsing error returns [].
    """
    params = {
        "search_query": f"all:{query}",
        "start": 0,
        "max_results": limit,
    }

    try:
        await throttle("arxiv")
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(ARXIV_API_URL, params=params)
            response.raise_for_status()
    except Exception as exc:  # noqa: BLE001 - fail soft, never take down the investigation
        print(f"[arxiv] search failed for query={query!r}: {exc!r}")
        return []

    try:
        root = ET.fromstring(response.text)
        entries = root.findall(_tag("entry"))
        papers = []
        for entry in entries:
            paper = _parse_entry(entry)
            if paper is not None:
                papers.append(paper)
        return papers[:limit]
    except Exception as exc:  # noqa: BLE001
        print(f"[arxiv] failed to parse response for query={query!r}: {exc!r}")
        return []
