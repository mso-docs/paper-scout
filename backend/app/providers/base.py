"""Shared normalized paper model for all provider integrations.

Every provider module (arxiv, semantic_scholar, openalex, huggingface)
converts its own response shape into a list of `NormalizedPaper` so the
rest of the backend can reason over one common representation instead of
provider-specific payloads. See docs/integrations.md, "Normalized Paper
Model".
"""

from pydantic import BaseModel


class NormalizedPaper(BaseModel):
    title: str
    authors: list[str] = []
    abstract: str | None = None
    year: int | None = None
    doi: str | None = None
    arxiv_id: str | None = None
    url: str | None = None
    full_text_url: str | None = None
    citation_count: int | None = None
    source: str
    provider_id: str | None = None
