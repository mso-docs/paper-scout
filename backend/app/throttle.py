"""Shared async throttle for outgoing calls to rate-limited external APIs.

Implements plan.md item 5 (request throttle/queue) against the per-source
registry in `app.rate_limits` (item 6). Any code that calls an external API
(arXiv, Semantic Scholar, OpenAlex, Hugging Face, Anthropic, ...) should
`await throttle(<source>)` immediately before making the call:

    from app.throttle import throttle

    await throttle("arxiv")
    response = await http_client.get(...)

`throttle()` only manages timing — it never makes network calls itself,
which keeps it easy to unit test without mocking HTTP.

Concurrency: the limit for each source is enforced process-wide, across
every caller/coroutine, not per-caller. Concurrent coroutines all calling
`throttle("arxiv")` at once will queue up (via a per-source `asyncio.Lock`)
and be released one at a time, spaced out to respect that source's rate
limit, rather than racing past each other.

Implementation: a "leaky bucket" / minimum-spacing scheme. Each source's
`{requests, interval_ms}` limit is normalized to a minimum spacing between
consecutive calls (`interval_ms / requests`). We track the next moment a
call to that source is allowed; each call waits (if needed) until that
moment, then pushes the next-allowed moment forward by one spacing unit.
"""

import asyncio
import time

from app.rate_limits import RATE_LIMITS

# Per-source lock, created lazily on first use. Guarded by _locks_guard so
# concurrent first-callers for the same new source don't race to create two
# different Lock objects for it.
_locks: dict[str, asyncio.Lock] = {}
_locks_guard = asyncio.Lock()

# Monotonic-clock timestamp (seconds, from time.monotonic()) of the earliest
# moment the next call for a given source is allowed to proceed.
_next_allowed_at: dict[str, float] = {}


async def _get_lock(source: str) -> asyncio.Lock:
    async with _locks_guard:
        lock = _locks.get(source)
        if lock is None:
            lock = asyncio.Lock()
            _locks[source] = lock
        return lock


async def throttle(source: str) -> None:
    """Wait as needed so calls to `source` don't exceed RATE_LIMITS[source].

    Safe to call concurrently from multiple coroutines/requests — enforces
    the limit for that source across ALL callers process-wide, not per-caller.

    Raises:
        ValueError: if `source` is not a key in `RATE_LIMITS`. A typo'd or
            unregistered source name fails loudly instead of silently
            bypassing throttling.
    """
    if source not in RATE_LIMITS:
        raise ValueError(
            f"Unknown rate-limit source {source!r}. Add it to "
            f"RATE_LIMITS in app/rate_limits.py before throttling it. "
            f"Known sources: {sorted(RATE_LIMITS)}"
        )

    limit = RATE_LIMITS[source]
    min_spacing_s = limit["interval_ms"] / limit["requests"] / 1000.0

    lock = await _get_lock(source)
    async with lock:
        now = time.monotonic()
        next_allowed = _next_allowed_at.get(source, now)

        wait_s = next_allowed - now
        if wait_s > 0:
            await asyncio.sleep(wait_s)
            now = time.monotonic()

        # Schedule the next call relative to the slot we just took (not
        # `now` after sleeping), so a burst of queued callers gets spaced
        # out evenly rather than drifting later with each call.
        _next_allowed_at[source] = max(next_allowed, now) + min_spacing_s
