"""In-process pub/sub event hub for live SSE updates (Kanban card movement).

A simple asyncio-based broadcaster. Tasks/agents call :func:`publish` whenever a
card changes (status transition, event appended, decision sealed), and any
connected ``GET /decisions/stream`` subscribers receive the update so the Kanban
cards animate/update in-flight without a full poll.

Thread-safety: ``publish`` is called from *synchronous* FastAPI endpoints (AnyIO
worker threads) and from the dispatcher thread, while ``subscribe`` runs on the
event loop. ``asyncio.Queue.put_nowait`` is not thread-safe, so publishers hop
onto each subscriber's loop via ``loop.call_soon_threadsafe``; the subscriber
registry itself is guarded by a lock because both worlds touch it.

This is a per-process broadcast. In a multi-worker deployment you would back it
with Redis pub/sub; the single-worker demo keeps it in-process for simplicity.
"""
import asyncio
import json
import threading
import time
from typing import Any, AsyncIterator


class EventHub:
    """Fan-out hub: many cross-thread publishers, many event-loop subscribers."""

    def __init__(self) -> None:
        # subscriber queue -> the event loop that awaits it
        self._subscribers: dict[asyncio.Queue[dict[str, Any]], asyncio.AbstractEventLoop] = {}
        self._lock = threading.Lock()

    def publish(self, event: dict[str, Any]) -> None:
        """Fan a status/event update out to all connected SSE clients (fire-and-forget).

        Safe to call from any thread: the event is handed to each subscriber's
        own event loop rather than touching ``asyncio.Queue`` directly.
        """
        with self._lock:
            targets = list(self._subscribers.items())
        for queue, loop in targets:
            try:
                loop.call_soon_threadsafe(self._offer, queue, event)
            except RuntimeError:
                # Subscriber's loop closed while it was disconnecting; drop it.
                self._discard(queue)

    @staticmethod
    def _offer(queue: asyncio.Queue[dict[str, Any]], event: dict[str, Any]) -> None:
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass  # slow subscriber drops the update rather than backlogging us

    def _discard(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        with self._lock:
            self._subscribers.pop(queue, None)

    async def subscribe(self) -> AsyncIterator[dict[str, Any]]:
        """Yield events for a single SSE client until it disconnects."""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        with self._lock:
            self._subscribers[queue] = asyncio.get_running_loop()
        try:
            while True:
                event = await queue.get()
                yield event
        finally:
            self._discard(queue)


event_hub = EventHub()


def format_sse(event: dict[str, Any]) -> str:
    """Serialise one hub event as an SSE ``data:`` frame."""
    data = json.dumps(event, default=str)
    return f"data: {data}\n\n"


def emit_event(event_type: str, **payload: Any) -> None:
    """Publish one event to every SSE subscriber (see :class:`EventHub`)."""
    event = {"event": event_type, "ts": time.time(), **payload}
    event_hub.publish(event)
