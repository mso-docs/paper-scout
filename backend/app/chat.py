"""Chat with Paper orchestration (plan.md item 13).

Thin wrapper around app.llm.answer_question: the actual paper-identification
and content-retrieval work (item 13's "identify the current paper" /
"retrieve paper content" steps) happens on the extension side — it sends
whatever page text and metadata it already captured (item 4's DOM capture
for HTML pages; PDF extraction is the item 12 stretch goal, not required
here). This module's job is just to call the LLM and shape the response,
without crashing the request if the LLM call itself fails.
"""

from app.llm import answer_question
from app.models import ChatRequest, ChatResponse

_LLM_FAILURE_ANSWER = "Something went wrong answering this question."


async def answer_chat_question(payload: ChatRequest) -> ChatResponse:
    try:
        result = await answer_question(
            question=payload.question,
            page_content=payload.page_content,
            page_metadata=payload.page_metadata,
        )
    except Exception as exc:  # noqa: BLE001 - a live demo shouldn't 500 on an LLM hiccup
        print(f"[chat] answer_question failed: {exc}")
        return ChatResponse(answer=_LLM_FAILURE_ANSWER, grounded=False)

    if not isinstance(result, dict):
        return ChatResponse(answer=_LLM_FAILURE_ANSWER, grounded=False)

    answer = result.get("answer") or _LLM_FAILURE_ANSWER
    grounded = bool(result.get("grounded"))
    return ChatResponse(answer=answer, grounded=grounded)
