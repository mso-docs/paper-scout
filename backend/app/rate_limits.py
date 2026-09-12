"""Per-source rate-limit registry (plan.md item 6).

Every external API Paper Scout calls (arXiv, Semantic Scholar, OpenAlex,
Hugging Face, Anthropic's Claude API) publishes its own rate limit, so
throttling can't be one hardcoded number baked into each integration.
`RATE_LIMITS` is the single place that knowledge lives: it maps a source
name to its limit, normalized as `{"requests": N, "interval_ms": M}`,
meaning "N requests per M milliseconds" (handles per-second, per-minute,
whatever the provider actually publishes).

`app.throttle` reads this registry, keyed by source name, so callers just
do `await throttle("arxiv")` before making a request.

These are MVP defaults based on each provider's published docs as of this
writing. If a provider's real limit differs (e.g. your account has a
higher Anthropic tier, or a provider changes its policy), or a new source
gets added (see plan.md item 1), update this dict — no throttle code
changes are needed.
"""

RATE_LIMITS: dict[str, dict[str, int]] = {
    # arXiv's terms of use ask for max 1 request per 3 seconds.
    "arxiv": {"requests": 1, "interval_ms": 3000},
    # Semantic Scholar standard tier, with an API key: 1 request/sec.
    "semantic_scholar": {"requests": 1, "interval_ms": 1000},
    # OpenAlex "polite pool" limit (requires an API key as of early 2026):
    # 10 requests/sec.
    "openalex": {"requests": 10, "interval_ms": 1000},
    # Hugging Face Hub API, authenticated: ~1 request/sec sustained,
    # expressed here as 10 requests per 10 seconds.
    "huggingface": {"requests": 10, "interval_ms": 10000},
    # Claude API Tier 1: 50 requests/minute. Conservative default — real
    # accounts may have a higher tier, but default to the safest published
    # number.
    "anthropic": {"requests": 50, "interval_ms": 60000},
}
