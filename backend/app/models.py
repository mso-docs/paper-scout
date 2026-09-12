"""Request/response schemas for the /v1/investigations and /v1/chat endpoints.

Field names and wire format here follow extension/BACKEND_HANDOFF.md exactly
(the contract the extension client already implements and validates against)
— NOT the earlier draft in plan.md's item 7/13, which used a different,
snake_case, two-category shape. That draft is superseded for this client.

Wire format is camelCase (matching the JS client); internal Python code can
use either the snake_case attribute or the camelCase alias when constructing
these models, since `populate_by_name=True` accepts both. FastAPI serializes
responses using the alias by default, so the JSON sent back to the extension
is camelCase as required.
"""

from pydantic import BaseModel, ConfigDict, Field


class PageMetadata(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = None
    url: str
    abstract: str | None = None
    doi: str | None = None
    arxiv_id: str | None = Field(default=None, alias="arxivId")
    authors: list[str] = []


class CaptureInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    captured_at: str = Field(alias="capturedAt")
    requested_range: str = Field(alias="requestedRange")
    warnings: list[str] = []


class CustomAI(BaseModel):
    """Present only when the user enabled "Use my own AI server/model" in the
    extension. The current backend does not implement this — see
    app.main's explicit-rejection handling — this model exists only so a
    request carrying `ai` still parses cleanly before being rejected.
    """

    model_config = ConfigDict(populate_by_name=True)

    base_url: str = Field(alias="baseUrl")
    model: str
    api_key: str | None = Field(default=None, alias="apiKey")


class InvestigationRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    schema_version: str = Field(alias="schemaVersion")
    highlight: str
    context_range: str = Field(alias="contextRange")
    context: str
    page_metadata: PageMetadata = Field(alias="pageMetadata")
    capture: CaptureInfo
    ai: CustomAI | None = None


class EvidenceItem(BaseModel):
    title: str
    url: str
    explanation: str


class InvestigationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    schema_version: str = Field(default="1.0", alias="schemaVersion")
    status: str  # "complete" | "insufficient_evidence"
    summary: str
    supports: list[EvidenceItem] = []
    contradicts: list[EvidenceItem] = []
    qualifies: list[EvidenceItem] = []
    related: list[EvidenceItem] = []
    warnings: list[str] = []


class ChatRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    schema_version: str = Field(alias="schemaVersion")
    question: str
    page_content: str = Field(alias="pageContent")
    page_metadata: PageMetadata = Field(alias="pageMetadata")
    ai: CustomAI | None = None


class ChatResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    schema_version: str = Field(default="1.0", alias="schemaVersion")
    answer: str
    grounded: bool
    warnings: list[str] = []
