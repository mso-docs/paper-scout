"""Paper Scout backend app shell.

Endpoint paths, request/response shapes, and auth here follow
extension/BACKEND_HANDOFF.md — the contract the extension client already
implements and validates against — not an earlier internal draft.
"""

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.chat import answer_chat_question
from app.config import settings
from app.investigate import run_investigation
from app.models import ChatRequest, ChatResponse, InvestigationRequest, InvestigationResponse

app = FastAPI(title="Paper Scout Backend")

# Permissive CORS is intentional: this API is called from a Chrome
# extension's `chrome-extension://` origin during a hackathon demo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def verify_backend_token(authorization: str | None = Header(default=None)) -> None:
    """Optional bearer-token auth, per extension/BACKEND_HANDOFF.md:
    "Optional backend token: Authorization: Bearer <backendToken>... Omit
    the header when no token is set." If BACKEND_TOKEN isn't configured,
    every request is accepted (local dev default). If it is configured, a
    missing/mismatched header is rejected with 401 — the status code the
    extension already maps to "check the backend token in Settings".
    """
    if not settings.backend_token:
        return
    if authorization != f"Bearer {settings.backend_token}":
        raise HTTPException(status_code=401, detail="Missing or invalid backend token.")


@app.get("/health", dependencies=[Depends(verify_backend_token)])
async def health() -> dict:
    return {"status": "ok", "apiVersion": "1.0"}


@app.post(
    "/v1/investigations",
    response_model=InvestigationResponse,
    dependencies=[Depends(verify_backend_token)],
)
async def investigate(payload: InvestigationRequest) -> InvestigationResponse:
    """Claim Investigator: search scholarly sources for the highlighted
    claim and classify results as supporting/contradicting/qualifying/
    related evidence. See app.investigate.run_investigation."""
    try:
        return await run_investigation(payload)
    except ValueError as exc:
        if str(exc) == "custom_ai_not_supported":
            raise HTTPException(
                status_code=422,
                detail="Custom AI overrides ('ai' field) are not supported yet.",
            ) from exc
        raise


@app.post(
    "/v1/chat",
    response_model=ChatResponse,
    dependencies=[Depends(verify_backend_token)],
)
async def chat(payload: ChatRequest) -> ChatResponse:
    """Chat with Paper: answer a question grounded only in the current
    paper's content. See app.chat.answer_chat_question. Not called by the
    extension yet (proposed contract) — implemented so the backend is
    ready when it is."""
    try:
        return await answer_chat_question(payload)
    except ValueError as exc:
        if str(exc) == "custom_ai_not_supported":
            raise HTTPException(
                status_code=422,
                detail="Custom AI overrides ('ai' field) are not supported yet.",
            ) from exc
        raise


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
