"""Run three live AI checks: python -m app.smoke_ai (from backend/).

Uses the configured provider and makes billable API requests. Search providers
are excluded so their availability does not obscure AI credential/model issues.
"""

import asyncio

from app.config import settings
from app.llm import AIError, answer_question, classify_evidence
from app.providers.base import NormalizedPaper


async def main() -> None:
    print(f"Testing {settings.llm_provider} with the configured model (3 AI requests).")
    content = (
        "The study enrolled 120 participants. The intervention reduced errors by 20%."
    )
    answer = await answer_question("How many participants were enrolled?", content, {})
    if not answer["grounded"] or "120" not in answer["answer"]:
        raise AIError("Grounded-answer check failed: expected 120 participants.")
    print("PASS: grounded answer")
    absent = await answer_question(
        "What was the participants' average age?", content, {}
    )
    if absent["grounded"]:
        raise AIError("Missing-information check failed: age is absent from the paper.")
    print("PASS: missing information is not presented as grounded")
    evidence = await classify_evidence(
        "The intervention reduced errors by 20%.",
        content,
        [
            NormalizedPaper(
                title="Synthetic test study",
                abstract=content,
                url="https://example.org/study",
                source="smoke-test",
            )
        ],
    )
    if not any(
        item["url"] == "https://example.org/study" for item in evidence["supporting"]
    ):
        raise AIError("Evidence check failed: expected the supplied supporting study.")
    print("PASS: evidence classification with the supplied source")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except AIError as exc:
        raise SystemExit(str(exc)) from None
