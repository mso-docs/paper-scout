import json
from unittest.mock import AsyncMock

import httpx
import pytest
from app import llm
from app.config import Settings, settings
from app.main import app
from app.providers.base import NormalizedPaper


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    monkeypatch.setattr(settings, "openai_model", "test-model")
    monkeypatch.setattr(settings, "anthropic_api_key", "test-claude-key")
    monkeypatch.setattr(settings, "backend_token", None)
    monkeypatch.setattr(llm, "throttle", AsyncMock())


def mock_http(monkeypatch, data, status=200):
    requests = []

    async def post(client, url, **kwargs):
        requests.append((url, kwargs))
        return httpx.Response(status, json=data, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    return requests


def envelope(value):
    return {
        "status": "completed",
        "output": [
            {"type": "reasoning"},
            {
                "type": "message",
                "content": [{"type": "output_text", "text": json.dumps(value)}],
            },
        ],
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("grounded", [True, False])
async def test_openai_chat(monkeypatch, grounded):
    result = {"answer": "120" if grounded else "Not provided.", "grounded": grounded}
    calls = mock_http(monkeypatch, envelope(result))
    assert await llm.answer_question("How many?", "120 participants.", {}) == result
    url, kwargs = calls[0]
    assert url == "https://api.openai.com/v1/responses"
    assert kwargs["headers"]["Authorization"] == "Bearer test-key"
    assert kwargs["json"]["model"] == "test-model"
    assert kwargs["json"]["store"] is False
    assert kwargs["json"]["text"]["format"]["type"] == "json_object"
    llm.throttle.assert_awaited_once_with("openai")


@pytest.mark.asyncio
async def test_anthropic_regression(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "anthropic")
    calls = mock_http(
        monkeypatch,
        {"content": [{"type": "text", "text": '{"answer":"120","grounded":true}'}]},
    )
    assert (await llm.answer_question("How many?", "120 participants.", {}))[
        "grounded"
    ] is True
    assert calls[0][1]["headers"]["x-api-key"] == "test-claude-key"
    assert "Authorization" not in calls[0][1]["headers"]
    llm.throttle.assert_awaited_once_with("anthropic")


@pytest.mark.asyncio
async def test_classification(monkeypatch):
    expected = {
        "summary": "Supports the claim.",
        "supporting": [
            {
                "title": "Study",
                "url": "https://example.org/study",
                "why": "Observed the effect.",
            }
        ],
        "contradicting": [],
        "qualifying": [],
        "related": [],
    }
    calls = mock_http(monkeypatch, envelope(expected))
    paper = NormalizedPaper(
        title="Study",
        abstract="Observed the effect.",
        url="https://example.org/study",
        source="test",
    )
    assert await llm.classify_evidence("Effect exists", "", [paper]) == expected
    assert "Observed the effect." in calls[0][1]["json"]["input"]
    calls.clear()
    assert (await llm.classify_evidence("Claim", "", []))["supporting"] == []
    assert calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status, phrase",
    [
        (401, "API key"),
        (403, "permissions"),
        (404, "model"),
        (429, "quota"),
        (400, "compatibility"),
        (503, "unavailable"),
    ],
)
async def test_safe_provider_errors(monkeypatch, status, phrase):
    mock_http(monkeypatch, {"error": {"message": "secret-provider-payload"}}, status)
    with pytest.raises(llm.AIError, match=phrase) as caught:
        await llm.answer_question("Question", "Paper", {})
    assert "secret-provider-payload" not in str(caught.value)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "data",
    [
        envelope({"answer": "No", "grounded": "false"}),
        envelope([]),
        {"status": "incomplete", "output": []},
        {
            "status": "completed",
            "output": [{"type": "message", "content": [{"type": "refusal"}]}],
        },
        {"status": "completed", "output": []},
    ],
)
async def test_invalid_output(monkeypatch, data):
    mock_http(monkeypatch, data)
    with pytest.raises(llm.AIError):
        await llm.answer_question("Question", "Paper", {})


@pytest.mark.asyncio
async def test_missing_key_and_unknown_provider(monkeypatch):
    calls = mock_http(monkeypatch, {})
    monkeypatch.setattr(settings, "openai_api_key", None)
    with pytest.raises(llm.AIError, match="OPENAI_API_KEY"):
        await llm.answer_question("Question", "Paper", {})
    monkeypatch.setattr(settings, "llm_provider", "unknown")
    with pytest.raises(llm.AIError, match="LLM_PROVIDER"):
        await llm.answer_question("Question", "Paper", {})
    assert not calls


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error, phrase",
    [
        (httpx.ReadTimeout("private"), "timed out"),
        (httpx.ConnectError("private"), "network"),
    ],
)
async def test_transport_errors(monkeypatch, error, phrase):
    monkeypatch.setattr(llm, "_call_openai", AsyncMock(side_effect=error))
    with pytest.raises(llm.AIError, match=phrase):
        await llm.answer_question("Question", "Paper", {})


@pytest.mark.asyncio
async def test_endpoints_surface_errors(monkeypatch):
    from app import investigate

    mock_http(monkeypatch, {}, 401)
    for provider in (
        investigate.arxiv,
        investigate.openalex,
        investigate.semantic_scholar,
        investigate.huggingface,
    ):
        monkeypatch.setattr(
            provider,
            "search",
            AsyncMock(return_value=[NormalizedPaper(title="Study", source="test")]),
        )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # Use request(), since post() is the mocked provider boundary.
        chat = await client.request(
            "POST",
            "/v1/chat",
            json={
                "schemaVersion": "1.0",
                "question": "How many?",
                "pageContent": "120",
                "pageMetadata": {"url": "https://example.org"},
            },
        )
        assert chat.status_code == 200
        assert chat.json()["grounded"] is False
        assert "API key" in chat.json()["warnings"][0]
        result = await client.request(
            "POST",
            "/v1/investigations",
            json={
                "schemaVersion": "1.0",
                "highlight": "Claim",
                "contextRange": "highlight",
                "context": "",
                "pageMetadata": {"url": "https://example.org"},
                "capture": {"capturedAt": "2026-09-12", "requestedRange": "highlight"},
            },
        )
        assert result.status_code == 200
        assert result.json()["status"] == "insufficient_evidence"
        assert "API key" in result.json()["warnings"][0]


def test_settings(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    assert Settings().llm_provider == "anthropic"
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_MODEL", "chosen-model")
    assert Settings().openai_model == "chosen-model"
    assert Settings().llm_provider == "openai"


@pytest.mark.asyncio
async def test_successful_chat_endpoint(monkeypatch):
    mock_http(monkeypatch, envelope({"answer": "120 participants.", "grounded": True}))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.request(
            "POST",
            "/v1/chat",
            json={
                "schemaVersion": "1.0",
                "question": "How many?",
                "pageContent": "120 participants.",
                "pageMetadata": {"url": "https://example.org"},
            },
        )
    assert response.json() == {
        "schemaVersion": "1.0",
        "answer": "120 participants.",
        "grounded": True,
        "warnings": [],
    }


@pytest.mark.asyncio
async def test_malformed_classification(monkeypatch):
    mock_http(
        monkeypatch,
        envelope(
            {
                "summary": "Evidence",
                "supporting": "invalid",
                "contradicting": [],
                "qualifying": [],
                "related": [],
            }
        ),
    )
    with pytest.raises(llm.AIError, match="malformed"):
        await llm.classify_evidence(
            "Claim", "", [NormalizedPaper(title="Study", source="test")]
        )
