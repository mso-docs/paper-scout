"""Paper Scout backend app shell.

This module wires up the FastAPI app, CORS, and a health check. The actual
/investigate and /chat business logic (rate limiting, provider clients, LLM
integration) is added on top of this skeleton by other modules.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.chat import answer_chat_question
from app.config import settings
from app.investigate import run_investigation
from app.models import ChatRequest, ChatResponse, InvestigateRequest, InvestigateResponse

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


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/investigate", response_model=InvestigateResponse)
async def investigate(payload: InvestigateRequest) -> InvestigateResponse:
    """Claim Investigator: search scholarly sources for the highlighted
    claim and classify results as supporting/contradicting/qualifying/
    related evidence. See app.investigate.run_investigation."""
    return await run_investigation(payload)


@app.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    """Chat with Paper: answer a question grounded only in the current
    paper's content. See app.chat.answer_chat_question."""
    return await answer_chat_question(payload)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
