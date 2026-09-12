"""Request/response schemas for the /investigate and /chat endpoints.

Shapes match plan.md items 7 and 13:
- Investigate: `{ highlight, contextRange, context, pageMetadata }` ->
  `{ summary, supporting, contradicting, qualifying, related }`
- Chat: `{ question, pageContent, pageMetadata }` -> `{ answer, grounded }`

Field names here are snake_case (Python convention); FastAPI/pydantic don't
require the extension to send camelCase, but if the extension ends up
sending camelCase JSON, add a pydantic alias config later rather than
renaming these.
"""

from pydantic import BaseModel


class InvestigateRequest(BaseModel):
    highlight: str
    context_range: str = "paragraph"
    context: str = ""
    page_metadata: dict = {}


class EvidenceItem(BaseModel):
    title: str
    url: str | None = None
    why: str = ""


class InvestigateResponse(BaseModel):
    summary: str
    supporting: list[EvidenceItem] = []
    contradicting: list[EvidenceItem] = []
    qualifying: list[EvidenceItem] = []
    related: list[EvidenceItem] = []


class ChatRequest(BaseModel):
    question: str
    page_content: str
    page_metadata: dict = {}


class ChatResponse(BaseModel):
    answer: str
    grounded: bool
