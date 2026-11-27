"""GET /api/v1/realtime/stream — Server-Sent Events of change notices."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.modules.identity.dependencies import get_current_user
from app.modules.realtime.hub import hub

router = APIRouter(prefix="/realtime", tags=["Realtime"])
HEARTBEAT_SECONDS = 15.0


@router.get("/stream")
async def realtime_stream(
    request: Request,
) -> StreamingResponse:
    """Change notices for the signed-in user: ``{type, entity, id, at}`` only.
    Clients refetch the entity through the normal authorised APIs."""
    from app.core.database import get_session_factory

    sf = get_session_factory()
    if sf is None:
        raise RuntimeError("Database is not configured.")

    async with sf() as db:
        user = await get_current_user(request=request, db=db)

    role = str(getattr(user.role, "value", user.role))
    sub = hub.connect(user.id, role)

    async def events() -> AsyncGenerator[bytes, None]:
        try:
            yield f"event: ready\ndata: {json.dumps({'role': role})}\n\n".encode()
            while True:
                try:
                    notice = await asyncio.wait_for(
                        sub.queue.get(), timeout=HEARTBEAT_SECONDS
                    )
                    yield f"event: change\ndata: {notice}\n\n".encode()
                except TimeoutError:
                    if await request.is_disconnected():
                        return
                    yield b": keep-alive\n\n"
        finally:
            hub.disconnect(sub)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/status")
async def realtime_status(request: Request) -> dict:
    """How many live connections this instance holds (no user data)."""
    from app.core.database import get_session_factory

    sf = get_session_factory()
    if sf is None:
        raise RuntimeError("Database is not configured.")

    async with sf() as db:
        await get_current_user(request=request, db=db)

    return {
        "connections": hub.connections,
        "published": hub.published,
        "delivered": hub.delivered,
    }
