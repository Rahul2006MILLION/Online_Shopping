import asyncio
import uuid
from collections.abc import AsyncGenerator
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.modules.auctions.schemas import (
    AuctionAcceptRequest,
    AuctionAcceptResponse,
    AuctionBidRequest,
    AuctionBidView,
    AuctionList,
    AuctionStartRequest,
    AuctionView,
)
from app.modules.auctions.service import AuctionService
from app.modules.catalogue.models import Retailer
from app.modules.identity.dependencies import (
    get_current_retailer,
    require_admin,
    require_retailer,
    require_role,
    verify_csrf_token,
)
from app.modules.identity.models import User

require_customer = require_role("customer")

router = APIRouter(
    prefix="/auctions",
    tags=["Dukaan vs Dukaan"],
    dependencies=[Depends(verify_csrf_token)],
)
retailer_router = APIRouter(
    prefix="/retailer/auctions",
    tags=["Dukaan vs Dukaan (Retailer)"],
    dependencies=[Depends(require_retailer), Depends(verify_csrf_token)],
)
admin_router = APIRouter(
    prefix="/admin/auctions",
    tags=["Dukaan vs Dukaan (Admin)"],
    dependencies=[Depends(require_admin), Depends(verify_csrf_token)],
)

SSE_TICK_SECONDS = 2.0


@router.post("/start", response_model=AuctionView, status_code=201)
async def start_auction(
    payload: AuctionStartRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_customer)],
) -> AuctionView:
    svc = AuctionService(db)
    return await svc.view(await svc.start(user.id, payload.pincode), include_bids=True)


@router.get("/active", response_model=AuctionView | None)
async def get_active_auction(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_customer)],
) -> AuctionView | None:
    """Return the customer's currently active or completed auction awaiting choice, if any."""
    svc = AuctionService(db)
    active = await svc.get_active_for_customer(user.id)
    if not active:
        return None
    return await svc.view(active, include_bids=True)


@router.get("/{auction_id}/live", response_model=AuctionView)
async def live_auction(
    auction_id: uuid.UUID,
    request: Request,
    user: Annotated[User, Depends(require_customer)],
    max_seconds: Annotated[int, Query(ge=1, le=120)] = 100,
):
    """JSON snapshot of the live auction, or a Server-Sent Events stream
    (`Accept: text/event-stream`) pushing a snapshot every 2 seconds until the
    auction closes."""
    from app.core.database import get_session_factory

    sf = get_session_factory()
    if sf is None:
        raise RuntimeError("Database is not configured.")

    async with sf() as db:
        svc = AuctionService(db)
        a = await svc.get_own(auction_id, user.id)
        if "text/event-stream" not in request.headers.get("accept", ""):
            return await svc.view(a, include_bids=True)

    user_id = user.id

    async def events() -> AsyncGenerator[bytes, None]:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + max_seconds
        while True:
            async with sf() as s:
                ssvc = AuctionService(s)
                cur = await ssvc.get_own(auction_id, user_id)
                snapshot = await ssvc.view(cur, include_bids=True)
                await s.commit()
            yield f"event: auction\ndata: {snapshot.model_dump_json()}\n\n".encode()
            if (
                snapshot.status != "ACTIVE"
                or loop.time() >= deadline
                or await request.is_disconnected()
            ):
                yield b"event: end\ndata: {}\n\n"
                return
            await asyncio.sleep(SSE_TICK_SECONDS)

    return StreamingResponse(
        events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"}
    )


@router.post("/{auction_id}/accept", response_model=AuctionAcceptResponse)
async def accept_auction_bid(
    auction_id: uuid.UUID,
    payload: AuctionAcceptRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_customer)],
) -> AuctionAcceptResponse:
    svc = AuctionService(db)
    a, cart = await svc.accept(auction_id, user.id, payload.bid_id)
    is_sim = bool(getattr(a, "winning_bid_is_simulated", False))
    msg = (
        "Winning offer applied. Your basket now uses this store at the bid price for 30 minutes."
        if not is_sim
        else "Demo simulated offer selected. As this was a simulation, no real order or payment obligation was created."
    )
    return AuctionAcceptResponse(
        auction=await svc.view(a, include_bids=True),
        cart_id=cart.id if cart else uuid.UUID(int=0),
        message=msg,
    )


@router.post("/{auction_id}/cancel", response_model=AuctionView)
async def cancel_auction(
    auction_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_customer)],
) -> AuctionView:
    svc = AuctionService(db)
    return await svc.view(await svc.cancel(auction_id, user.id), include_bids=True)


@retailer_router.get("", response_model=AuctionList)
async def retailer_live_auctions(
    db: Annotated[AsyncSession, Depends(get_db)],
    retailer: Annotated[Retailer, Depends(get_current_retailer)],
) -> AuctionList:
    """Live auctions in your service area for baskets you can fully supply.
    Shows the current best price (not who placed it) so stores can compete."""
    svc = AuctionService(db)
    rows = await svc.open_for_retailer(retailer)
    items = [
        await svc.view(a, include_bids=False, retailer=retailer, retailer_lines=lines)
        for a, lines in rows
    ]
    return AuctionList(items=items, total=len(items))


@retailer_router.get("/recent", response_model=AuctionList)
async def retailer_recent_auctions(
    db: Annotated[AsyncSession, Depends(get_db)],
    retailer: Annotated[Retailer, Depends(get_current_retailer)],
) -> AuctionList:
    """Auctions you bid in during the last 24 hours whose bidding has ended,
    with your final position and outcome (won / not selected / awaiting choice)."""
    svc = AuctionService(db)
    rows = await svc.recent_for_retailer(retailer)
    items = [await svc.view(a, include_bids=False, retailer=retailer) for a in rows]
    return AuctionList(items=items, total=len(items))


@retailer_router.post(
    "/{auction_id}/bid", response_model=AuctionBidView, status_code=201
)
async def retailer_place_bid(
    auction_id: uuid.UUID,
    payload: AuctionBidRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    retailer: Annotated[Retailer, Depends(get_current_retailer)],
) -> AuctionBidView:
    svc = AuctionService(db)
    b = await svc.bid(auction_id, retailer, payload)
    from app.modules.auctions.models import BasketAuction

    a = await db.get(BasketAuction, auction_id)
    view = await svc.view(a, include_bids=True)
    return next(x for x in view.bids if x.retailer_id == retailer.id and x.id == b.id)


@retailer_router.post(
    "/{auction_id}/simulate", response_model=AuctionBidView, status_code=201
)
async def retailer_simulate_bid(
    auction_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    retailer: Annotated[Retailer, Depends(get_current_retailer)],
) -> AuctionBidView:
    """Simulate a competitive bid on an active auction for demo purposes."""
    svc = AuctionService(db)
    b = await svc.simulate_bid(auction_id, retailer)
    from app.modules.auctions.models import BasketAuction

    a = await db.get(BasketAuction, auction_id)
    view = await svc.view(a, include_bids=True)
    return next(x for x in view.bids if x.retailer_id == retailer.id and x.id == b.id)


@admin_router.get("", response_model=AuctionList)
async def admin_auctions(
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Literal["ACTIVE", "COMPLETED", "NO_BIDS", "AWARDED", "CANCELLED"]
    | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuctionList:
    svc = AuctionService(db)
    rows, total = await svc.list_admin(status, limit, offset)
    return AuctionList(
        items=[await svc.view(a, include_bids=True) for a in rows], total=total
    )
