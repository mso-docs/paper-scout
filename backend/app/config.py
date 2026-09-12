"""Application configuration.

Loads environment variables from `backend/.env` (see `backend/.env.example`
for the full list of variables and what they're for) plus the process
environment, and exposes a single module-level `settings` object.

Other modules should do:

    from app.config import settings

Note: `anthropic_api_key` is required for the app to actually function (it's
used for evidence classification and summary generation), but it is kept
optional here at load time so importing this module never raises just
because a `.env` file hasn't been created yet (e.g. in a fresh venv or CI).
Code that actually calls the Anthropic API should check
`settings.anthropic_api_key` and fail there if it's missing.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env if present. This does not override variables already
# set in the real process environment.
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH)


def _get_optional(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None or value == "":
        return None
    return value


class Settings:
    """Runtime configuration, sourced from environment variables."""

    def __init__(self) -> None:
        # Required for the app to function, but not enforced at import time
        # (see module docstring) — may be None if unset.
        self.anthropic_api_key: str | None = _get_optional("ANTHROPIC_API_KEY")

        # Optional third-party API keys.
        self.semantic_scholar_api_key: str | None = _get_optional(
            "SEMANTIC_SCHOLAR_API_KEY"
        )
        self.openalex_api_key: str | None = _get_optional("OPENALEX_API_KEY")
        self.huggingface_api_key: str | None = _get_optional("HUGGINGFACE_API_KEY")

        # Optional bearer token the extension authenticates to *this backend*
        # with (not an AI provider key). Per extension/BACKEND_HANDOFF.md: if
        # unset, the backend accepts unauthenticated requests (local dev);
        # if set, requests must carry `Authorization: Bearer <token>`.
        self.backend_token: str | None = _get_optional("BACKEND_TOKEN")

        # Local server port the extension calls.
        self.port: int = int(os.environ.get("PORT", "8787"))


settings = Settings()
