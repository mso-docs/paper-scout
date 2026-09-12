"""Chat with Paper orchestration (plan.md item 13).

Called by the extension sidebar through the versioned /v1/chat contract.

The actual paper-identification and content-retrieval work (item 13's
"identify the current paper" / "retrieve paper content" steps) happens on
the extension side — it sends whatever page text and metadata it already
captured. This module's job is just to call the LLM and shape the
response, without crashing the request if the LLM call itself fails.
"""

from app.llm import ai_error_message, answer_question
from app.models import ChatRequest, ChatResponse

_LLM_FAILURE_ANSWER = "Something went wrong answering this question."


async def answer_chat_question(payload: ChatRequest) -> ChatResponse:
    if payload.ai is not None:
        # Custom AI overrides aren't implemented yet — see app.investigate
        # for the same policy; app.main raises this as a 422.
        raise ValueError("custom_ai_not_supported")

    try:
        result = await answer_question(
            question=payload.question,
            page_content=payload.page_content,
            page_metadata=payload.page_metadata.model_dump(by_alias=True),
        )
    except Exception as exc:  # noqa: BLE001 - a live demo shouldn't 500 on an LLM hiccup
        print(f"[chat] answer_question failed: {type(exc).__name__}")
        return ChatResponse(
            answer=_LLM_FAILURE_ANSWER,
            grounded=False,
            warnings=[ai_error_message(exc)],
        )

    if not isinstance(result, dict):
        return ChatResponse(
            answer=_LLM_FAILURE_ANSWER,
            grounded=False,
            warnings=[_LLM_FAILURE_ANSWER],
        )

    answer = result.get("answer") or _LLM_FAILURE_ANSWER
    grounded = bool(result.get("grounded"))
    return ChatResponse(answer=answer, grounded=grounded, warnings=[])
