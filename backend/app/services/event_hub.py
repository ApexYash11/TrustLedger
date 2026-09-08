"""In-process pub/sub event hub for live SSE updates (Kanban card movement).

A simple asyncio-based broadcaster. Tasks/agents call :func:`publish` whenever a
card changes (status transition, event appended, decision sealed), and any
connected ``GET /decisions/stream`` subscribers receive the update so the Kanban
cards animate/update in-flight without a full poll.

This is a per-process broadcast. In a multi-worker deployment you would back it
with Redis pub/sub; the single-worker demo keeps it in-process for simplicity.
"""
import asyncio
import json
import time
from typing import Any, AsyncIterator, Set


class EventHub:
    def __init__(self) -> None:
        self._subscribers: Set[asyncio.Queue[dict[str, Any]]] = set()

    def publish(self, event: dict[str, Any]) -> None:
        """Fan a status/event update out to all connected SSE clients (fire-and-forget)."""
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass  # slow subscriber drops the update rather than backlogging us

    async def subscribe(self) -> AsyncIterator[dict[str, Any]]:
        """Yield events for a single SSE client until it disconnects."""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        try:
            while True:
                event = await queue.get()
                yield event
        finally:
            self._subscribers.discard(queue)


event_hub = EventHub()


def format_sse(event: dict[str, Any]) -> str:
    data = json.dumps(event, default=str)
    return f"data: {data}\n\n"


def emit_event(event_type: str, **payload: Any) -> None:
    event = {"event": event_type, "ts": time.time(), **payload}
    event_hub.publish(event)
