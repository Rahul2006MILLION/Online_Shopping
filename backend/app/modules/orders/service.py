import hashlib
import json
import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.modules.inventory.models import ReservationStatus
from app.modules.inventory.service import ReservationService
from app.modules.orders.carrier import get_carrier_provider
from app.modules.orders.models import (
    CustomerNotification,
    Order,
    OrderItem,
    OrderReturn,
    OrderStatus,
    OrderStatusHistory,
    PaymentStatus,
    ReturnItem,
    ReturnStatus,
    ReturnStatusHistory,
    Shipment,
    ShipmentItem,
    ShipmentStatus,
)
from app.modules.orders.notifications import (
    InAppNotificationDispatcher,
    NotificationEventType,
    get_email_provider,
    get_sms_provider,
)
from app.modules.orders.repository import OrderRepository
from app.modules.orders.schemas import (
    CreateOrderRequest,
    CreateShipmentRequest,
    OrderCancellationResponse,
    OrderTrackingResponse,
    OrderTrackingTimelineEvent,
    ReturnCreateRequest,
    ReturnStatusUpdateRequest,
    UpdateShipmentStatusRequest,
)
from app.modules.payments.schemas import CreateRefundRequest
from app.modules.payments.service import PaymentService
from app.modules.pricing.models import QuoteStatus

logger = logging.getLogger(__name__)

# Allowed post-purchase lifecycle transitions. Anything not listed is rejected so
# that privileged callers cannot replay side effects (refunds, restocking) or
# jump an order/return into an arbitrary state.
RETURN_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    "REQUESTED": frozenset({"APPROVED", "REJECTED", "CANCELLED"}),
    "APPROVED": frozenset({"PICKUP_PENDING", "RECEIVED", "CANCELLED"}),
    "PICKUP_PENDING": frozenset({"RECEIVED", "CANCELLED"}),
    "RECEIVED": frozenset({"INSPECTED"}),
    "INSPECTED": frozenset({"REFUND_PENDING", "REFUNDED", "REJECTED"}),
    "REFUND_PENDING": frozenset({"REFUNDED"}),
    "REFUNDED": frozenset(),
    "REJECTED": frozenset(),
    "CANCELLED": frozenset(),
}

SHIPMENT_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    "LABEL_CREATED": frozenset(
        {
            "PICKED_UP",
            "IN_TRANSIT",
            "OUT_FOR_DELIVERY",
            "DELIVERED",
            "EXCEPTION",
            "CANCELLED",
        }
    ),
    "PICKED_UP": frozenset(
        {"IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"}
    ),
    "IN_TRANSIT": frozenset({"OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"}),
    "OUT_FOR_DELIVERY": frozenset({"DELIVERED", "EXCEPTION"}),
    "EXCEPTION": frozenset(
        {"IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"}
    ),
    "DELIVERED": frozenset(),
    "CANCELLED": frozenset(),
}

_SHIPMENT_FROZEN_ORDER_STATES = frozenset({"CANCELLED", "RETURNED", "PENDING_PAYMENT"})


def compute_canonical_request_hash(
    req: CreateOrderRequest | None = None,
    customer_id: uuid.UUID | None = None,
    guest_token_hash: str | None = None,
    address_snapshot: dict[str, Any] | None = None,
    *,
    quote_id: uuid.UUID | None = None,
    reservation_id: uuid.UUID | None = None,
) -> str:
    """Computes a deterministic SHA-256 fingerprint over all meaningful checkout inputs."""
    eff_quote_id = quote_id or (req.quote_id if req else None)
    eff_res_id = reservation_id or (req.reservation_id if req else None)

    data: dict[str, Any] = {
        "quote_id": str(eff_quote_id),
        "reservation_id": str(eff_res_id),
    }

    if address_snapshot:
        data["delivery_address"] = {
            "full_name": address_snapshot.get("full_name", "").strip(),
            "address_line1": address_snapshot.get("address_line1", "").strip(),
            "address_line2": (address_snapshot.get("address_line2") or "").strip(),
            "city": address_snapshot.get("city", "").strip(),
            "state": address_snapshot.get("state", "").strip(),
            "postal_code": address_snapshot.get("postal_code", "").strip(),
            "phone": address_snapshot.get("phone", "").strip(),
        }
    elif req and req.delivery_address_id:
        data["delivery_address"] = {
            "type": "saved",
            "address_id": str(req.delivery_address_id),
        }
    elif req and req.delivery_address:
        data["delivery_address"] = {
            "type": "inline",
            "full_name": req.delivery_address.full_name.strip(),
            "address_line1": req.delivery_address.address_line1.strip(),
            "address_line2": (req.delivery_address.address_line2 or "").strip(),
            "city": req.delivery_address.city.strip(),
            "state": req.delivery_address.state.strip(),
            "postal_code": req.delivery_address.postal_code.strip(),
            "phone": req.delivery_address.phone.strip(),
        }

    if customer_id:
        data["caller"] = {"customer_id": str(customer_id)}
    elif guest_token_hash:
        data["caller"] = {"guest_token_hash": guest_token_hash}

    canonical_json = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


class OrderService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = OrderRepository(session)

    async def create_order(
        self,
        req: CreateOrderRequest,
        customer_id: uuid.UUID | None = None,
        guest_token_hash: str | None = None,
    ) -> Order:
        """Atomic PostgreSQL transaction creating an order from active quote and reservation."""
        if not customer_id and not guest_token_hash:
            raise AppException(
                code="UNAUTHORIZED",
                message="Authentication or guest session is required.",
                status_code=401,
            )

        now = datetime.now(UTC)

        # 1. Derive effective quote_id and peek reservation if quote_id was omitted
        effective_quote_id = req.quote_id
        if not effective_quote_id:
            res_peek = await self.repo.get_reservation_by_id(req.reservation_id)
            if not res_peek:
                raise AppException(
                    code="RESERVATION_NOT_FOUND",
                    message="Inventory reservation was not found.",
                    status_code=404,
                )

            # Validate reservation ownership to prevent foreign-owned derivation or IDOR
            if customer_id:
                if res_peek.customer_id != customer_id:
                    raise AppException(
                        code="RESERVATION_NOT_FOUND",
                        message="Inventory reservation was not found.",
                        status_code=404,
                    )
            elif guest_token_hash:
                if (
                    res_peek.guest_token_hash != guest_token_hash
                    or res_peek.customer_id is not None
                ):
                    raise AppException(
                        code="RESERVATION_NOT_FOUND",
                        message="Inventory reservation was not found.",
                        status_code=404,
                    )

            # Validate reservation status
            if res_peek.status == ReservationStatus.CONFIRMED.value:
                raise AppException(
                    code="RESERVATION_ALREADY_CONFIRMED",
                    message="Reservation is already confirmed.",
                    status_code=409,
                )
            if res_peek.status == ReservationStatus.EXPIRED.value:
                raise AppException(
                    code="RESERVATION_EXPIRED",
                    message="Reservation hold has expired.",
                    status_code=409,
                )
            if res_peek.status == ReservationStatus.RELEASED.value:
                raise AppException(
                    code="RESERVATION_RELEASED",
                    message="Reservation hold has been released.",
                    status_code=409,
                )
            if res_peek.status != ReservationStatus.ACTIVE.value:
                raise AppException(
                    code="RESERVATION_INVALID_STATUS",
                    message=f"Reservation status is {res_peek.status}. Only active reservations can be ordered.",
                    status_code=409,
                )

            # Validate reservation expiry
            res_peek_exp = (
                res_peek.expires_at.replace(tzinfo=UTC)
                if res_peek.expires_at.tzinfo is None
                else res_peek.expires_at
            )
            if res_peek_exp < now:
                raise AppException(
                    code="RESERVATION_EXPIRED",
                    message="Reservation hold has expired.",
                    status_code=409,
                )

            # Validate quote association
            if not res_peek.quote_id:
                raise AppException(
                    code="RESERVATION_NO_QUOTE_ASSOCIATED",
                    message="Inventory reservation has no associated quote.",
                    status_code=400,
                )

            effective_quote_id = res_peek.quote_id

        # 2. Resolve Delivery Address snapshot early to compute canonical request hash
        address_snapshot: dict[str, Any]
        if req.delivery_address_id:
            if not customer_id:
                raise AppException(
                    code="INVALID_ADDRESS_SELECTION",
                    message="Saved addresses are only accessible to authenticated customers.",
                    status_code=400,
                )
            saved_addr = await self.repo.get_customer_address(
                req.delivery_address_id, customer_id
            )
            if not saved_addr:
                raise AppException(
                    code="ADDRESS_NOT_FOUND",
                    message="Selected delivery address was not found.",
                    status_code=404,
                )
            address_snapshot = {
                "full_name": saved_addr.recipient_name,
                "address_line1": saved_addr.line1,
                "address_line2": saved_addr.line2,
                "city": saved_addr.city,
                "state": saved_addr.state,
                "postal_code": saved_addr.postal_code,
                "phone": saved_addr.phone,
            }
        elif req.delivery_address:
            address_snapshot = {
                "full_name": req.delivery_address.full_name,
                "address_line1": req.delivery_address.address_line1,
                "address_line2": req.delivery_address.address_line2,
                "city": req.delivery_address.city,
                "state": req.delivery_address.state,
                "postal_code": req.delivery_address.postal_code,
                "phone": req.delivery_address.phone,
            }
        elif customer_id:
            # Authenticated customer without explicit delivery_address_id: use saved default address
            saved_default = await self.repo.get_default_customer_address(customer_id)
            if saved_default:
                address_snapshot = {
                    "full_name": saved_default.recipient_name,
                    "address_line1": saved_default.line1,
                    "address_line2": saved_default.line2,
                    "city": saved_default.city,
                    "state": saved_default.state,
                    "postal_code": saved_default.postal_code,
                    "phone": saved_default.phone,
                }
            else:
                address_snapshot = {
                    "full_name": "Valued Customer",
                    "address_line1": "Standard Delivery",
                    "address_line2": None,
                    "city": "Bengaluru",
                    "state": "KA",
                    "postal_code": "560001",
                    "phone": "+919876543210",
                }
        else:
            # Guest checkout without delivery address ID: default guest delivery address
            address_snapshot = {
                "full_name": "Guest Customer",
                "address_line1": "Standard Delivery",
                "address_line2": None,
                "city": "Bengaluru",
                "state": "KA",
                "postal_code": "560001",
                "phone": "+919876543210",
            }

        # 3. Check Idempotency Record (Fast return before locking resources)
        req_hash = compute_canonical_request_hash(
            req=req,
            customer_id=customer_id,
            guest_token_hash=guest_token_hash,
            address_snapshot=address_snapshot,
            quote_id=effective_quote_id,
            reservation_id=req.reservation_id,
        )

        if req.idempotency_key:
            existing_record = await self.repo.get_idempotency_record(
                scope="order_placement",
                customer_id=customer_id,
                guest_token_hash=guest_token_hash,
                idempotency_key=req.idempotency_key,
            )
            if existing_record:
                if existing_record.request_hash == req_hash:
                    cached_order = await self.repo.get_order_by_id(
                        existing_record.order_id
                    )
                    if cached_order:
                        return cached_order
                else:
                    raise AppException(
                        code="IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
                        message="This idempotency key was previously used with a different request payload.",
                        status_code=409,
                    )

        # 4. Lock & Validate Checkout Quote
        quote = await self.repo.lock_quote_for_update(effective_quote_id)
        if not quote:
            raise AppException(
                code="QUOTE_NOT_FOUND",
                message="Checkout quote was not found.",
                status_code=404,
            )

        # Check idempotency record again after lock acquisition in case concurrent request completed while waiting
        if req.idempotency_key:
            existing_record = await self.repo.get_idempotency_record(
                scope="order_placement",
                customer_id=customer_id,
                guest_token_hash=guest_token_hash,
                idempotency_key=req.idempotency_key,
            )
            if existing_record:
                if existing_record.request_hash == req_hash:
                    cached_order = await self.repo.get_order_by_id(
                        existing_record.order_id
                    )
                    if cached_order:
                        return cached_order
                else:
                    raise AppException(
                        code="IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
                        message="This idempotency key was previously used with a different request payload.",
                        status_code=409,
                    )

        # Ownership validation
        if customer_id:
            if quote.customer_id != customer_id:
                raise AppException(
                    code="QUOTE_NOT_FOUND",
                    message="Checkout quote was not found.",
                    status_code=404,
                )
        elif guest_token_hash:
            if (
                quote.guest_token_hash != guest_token_hash
                or quote.customer_id is not None
            ):
                raise AppException(
                    code="QUOTE_NOT_FOUND",
                    message="Checkout quote was not found.",
                    status_code=404,
                )

        if quote.is_consumed:
            raise AppException(
                code="QUOTE_ALREADY_CONSUMED",
                message="This quote has already been ordered and consumed.",
                status_code=409,
            )

        q_exp = (
            quote.expires_at.replace(tzinfo=UTC)
            if quote.expires_at.tzinfo is None
            else quote.expires_at
        )
        if q_exp < now:
            raise AppException(
                code="QUOTE_EXPIRED",
                message="Checkout quote has expired. Please refresh your quote.",
                status_code=409,
            )

        # 5. Lock & Validate Inventory Reservation
        res = await self.repo.lock_reservation_for_update(req.reservation_id)
        if not res:
            raise AppException(
                code="RESERVATION_NOT_FOUND",
                message="Inventory reservation was not found.",
                status_code=404,
            )

        if res.quote_id != quote.id:
            raise AppException(
                code="RESERVATION_QUOTE_MISMATCH",
                message="Reservation does not belong to the specified quote.",
                status_code=400,
            )

        # Reservation ownership validation
        if customer_id:
            if res.customer_id != customer_id:
                raise AppException(
                    code="RESERVATION_NOT_FOUND",
                    message="Inventory reservation was not found.",
                    status_code=404,
                )
        elif guest_token_hash:
            if res.guest_token_hash != guest_token_hash or res.customer_id is not None:
                raise AppException(
                    code="RESERVATION_NOT_FOUND",
                    message="Inventory reservation was not found.",
                    status_code=404,
                )

        if res.status == ReservationStatus.CONFIRMED.value:
            raise AppException(
                code="RESERVATION_ALREADY_CONFIRMED",
                message="Reservation is already confirmed.",
                status_code=409,
            )
        if res.status == ReservationStatus.EXPIRED.value:
            raise AppException(
                code="RESERVATION_EXPIRED",
                message="Reservation hold has expired.",
                status_code=409,
            )
        if res.status == ReservationStatus.RELEASED.value:
            raise AppException(
                code="RESERVATION_RELEASED",
                message="Reservation hold has been released.",
                status_code=409,
            )

        res_exp = (
            res.expires_at.replace(tzinfo=UTC)
            if res.expires_at.tzinfo is None
            else res.expires_at
        )
        if res_exp < now:
            raise AppException(
                code="RESERVATION_EXPIRED",
                message="Reservation hold has expired.",
                status_code=409,
            )

        is_reservation_active = (
            res.status == ReservationStatus.ACTIVE.value and res_exp > now
        )

        if quote.status != QuoteStatus.ACTIVE.value:
            if not (
                quote.status == QuoteStatus.SUPERSEDED.value and is_reservation_active
            ):
                raise AppException(
                    code="QUOTE_INVALID_STATUS",
                    message=f"Quote status is {quote.status}. Only active quotes can be ordered.",
                    status_code=409,
                )

        # 5. Generate Human-Readable Order Number & Guest Access Token
        today_str = now.strftime("%Y%m%d")
        rand_suffix = uuid.uuid4().hex[:8].upper()
        order_number = f"BSK-{today_str}-{rand_suffix}"

        order_id = uuid.uuid4()
        payment_window_expires_at = min(res_exp, now + timedelta(minutes=15))

        guest_access_token: str | None = None
        guest_access_token_hash: str | None = None
        if not customer_id and guest_token_hash:
            guest_access_token = secrets.token_urlsafe(32)
            guest_access_token_hash = hashlib.sha256(
                guest_access_token.encode("utf-8")
            ).hexdigest()

        # 6. Create Order and OrderItems
        order = Order(
            id=order_id,
            order_number=order_number,
            customer_id=customer_id,
            guest_token_hash=guest_token_hash,
            guest_access_token_hash=guest_access_token_hash,
            quote_id=quote.id,
            reservation_id=res.id,
            delivery_address_snapshot=address_snapshot,
            subtotal_paise=quote.subtotal_paise,
            discount_total_paise=quote.discount_total_paise,
            delivery_fee_paise=quote.delivery_fee_paise,
            cgst_paise=quote.cgst_paise,
            sgst_paise=quote.sgst_paise,
            igst_paise=quote.igst_paise,
            total_tax_paise=quote.total_tax_paise,
            total_payable_paise=quote.total_payable_paise,
            currency=quote.currency,
            status=OrderStatus.PENDING_PAYMENT.value,
            payment_status=PaymentStatus.NOT_INITIATED.value,
            version=1,
            idempotency_key=req.idempotency_key,
            payment_window_expires_at=payment_window_expires_at,
            items=[
                OrderItem(
                    id=uuid.uuid4(),
                    order_id=order_id,
                    listing_id=item.listing_id,
                    variant_id=item.variant_id,
                    retailer_id=item.retailer_id,
                    product_title=item.product_title,
                    variant_title=item.variant_title,
                    sku=item.sku,
                    hsn_code=item.hsn_code,
                    gst_rate_basis_points=item.gst_rate_basis_points,
                    quantity=item.quantity,
                    unit_original_price_paise=item.unit_original_price_paise,
                    unit_selling_price_paise=item.unit_selling_price_paise,
                    unit_discount_paise=item.unit_discount_paise,
                    unit_discounted_price_paise=item.unit_discounted_price_paise,
                    total_selling_price_paise=item.total_selling_price_paise,
                    taxable_base_paise=item.taxable_base_paise,
                    cgst_paise=item.cgst_paise,
                    sgst_paise=item.sgst_paise,
                    igst_paise=item.igst_paise,
                    total_tax_paise=item.total_tax_paise,
                    retailer_name=item.retailer_name,
                    retailer_state=item.retailer_state,
                    fulfillment_status=OrderStatus.PENDING_PAYMENT.value,
                )
                for item in quote.items
            ],
            status_history=[
                OrderStatusHistory(
                    id=uuid.uuid4(),
                    order_id=order_id,
                    from_status=None,
                    to_status=OrderStatus.PENDING_PAYMENT.value,
                    reason="ORDER_CREATED",
                )
            ],
            shipments=[],
            returns=[],
        )
        self.repo.add_order(order)
        # Flush order first so its primary key exists before linking in inventory_reservations
        await self.repo.flush()

        # 7. Allocate Reservation to Order (Protects hold from ordinary cleanup)
        res.status = ReservationStatus.ALLOCATED_TO_ORDER.value
        res.order_id = order_id

        # 8. Consume Quote
        quote.is_consumed = True
        quote.status = QuoteStatus.CONSUMED.value
        quote.consumed_at = now

        # Phase 3: special prices applied to this quote are single-use.
        from app.modules.pricing.awards import consume_awards_for_quote

        await consume_awards_for_quote(
            self.session, quote_id=quote.id, order_id=order_id
        )

        # Version 2.0: reserve one use of each discount priced into the quote,
        # under row locks; 409 (whole order rolls back) if a limit is reached.
        from app.modules.pricing.redemptions import (
            applied_discount_ids,
            reserve_discount_usage,
        )

        await reserve_discount_usage(
            self.session,
            discount_ids=applied_discount_ids(quote.items),
            order_id=order_id,
        )

        # 9. Selective Cart Reconciliation
        if quote.cart_id:
            cart_items = await self.repo.get_cart_items_for_update(quote.cart_id)
            current_by_listing = {c_item.listing_id: c_item for c_item in cart_items}
            for q_item in quote.items:
                c_item = current_by_listing.get(q_item.listing_id)
                if not c_item:
                    continue
                if c_item.quantity <= q_item.quantity:
                    await self.session.delete(c_item)
                else:
                    c_item.quantity -= q_item.quantity

        # 10. Record Zero-PII Outbox Event
        outbox_payload = {
            "event_id": str(uuid.uuid4()),
            "event_type": "order.created",
            "schema_version": 1,
            "aggregate_id": str(order_id),
            "order_number": order_number,
            # No customer_id: customer identifiers are PII and the envelope
            # rejects them (this event could never be published).
            "is_guest": customer_id is None,
            "quote_id": str(quote.id),
            "reservation_id": str(res.id),
            "currency": quote.currency,
            "subtotal_paise": quote.subtotal_paise,
            "discount_total_paise": quote.discount_total_paise,
            "delivery_fee_paise": quote.delivery_fee_paise,
            "cgst_paise": quote.cgst_paise,
            "sgst_paise": quote.sgst_paise,
            "igst_paise": quote.igst_paise,
            "total_tax_paise": quote.total_tax_paise,
            "total_payable_paise": quote.total_payable_paise,
            "status": OrderStatus.PENDING_PAYMENT.value,
            "payment_status": PaymentStatus.NOT_INITIATED.value,
            "items": [
                {
                    "listing_id": str(item.listing_id),
                    "retailer_id": str(item.retailer_id),
                    "variant_id": str(item.variant_id),
                    "quantity": item.quantity,
                    "unit_selling_price_paise": item.unit_selling_price_paise,
                    "total_selling_price_paise": item.total_selling_price_paise,
                    "total_tax_paise": item.total_tax_paise,
                    "hsn_code": item.hsn_code,
                    "gst_rate_basis_points": item.gst_rate_basis_points,
                }
                for item in quote.items
            ],
            "created_at": now.isoformat(),
            "aggregate_version": order.version,
        }
        await self.repo.create_outbox_event(
            aggregate_type="order",
            aggregate_id=order_id,
            event_type="order.created",
            schema_version=1,
            payload=outbox_payload,
            aggregate_version=order.version,
        )

        # 11. Record Idempotency
        if req.idempotency_key:
            await self.repo.create_idempotency_record(
                scope="order_placement",
                customer_id=customer_id,
                guest_token_hash=guest_token_hash,
                idempotency_key=req.idempotency_key,
                request_hash=req_hash,
                order_id=order_id,
                expires_at=now + timedelta(days=1),
            )

        # 12. Flush and Concurrency Error Handling
        quote_id_val = quote.id
        try:
            await self.repo.flush()
        except IntegrityError as exc:
            import logging

            logging.getLogger("basket").error("ORDER FLUSH INTEGRITY ERROR: %s", exc)
            await self.session.rollback()
            # Handle concurrent race:
            # Check if this quote was already ordered by a winning transaction
            existing_order = await self.repo.get_order_by_quote_id(quote_id_val)
            if existing_order:
                if req.idempotency_key:
                    existing_record = await self.repo.get_idempotency_record(
                        scope="order_placement",
                        customer_id=customer_id,
                        guest_token_hash=guest_token_hash,
                        idempotency_key=req.idempotency_key,
                    )
                    if (
                        existing_record
                        and existing_record.request_hash == req_hash
                        and existing_record.order_id == existing_order.id
                    ):
                        return existing_order
                raise AppException(
                    code="QUOTE_ALREADY_ORDERED",
                    message="An order for this quote has already been created.",
                    status_code=409,
                ) from None
            raise AppException(
                code="ORDER_CREATION_CONFLICT",
                message="A conflicting order is currently being processed. Please retry.",
                status_code=409,
            ) from None

        if guest_access_token:
            order.guest_access_token = guest_access_token

        # Dispatch durable in-app notification
        try:
            await InAppNotificationDispatcher.dispatch(
                session=self.session,
                title="Order Placed Successfully",
                message=f"Order #{order_number} has been placed. Complete payment within 15 minutes to confirm.",
                event_type=NotificationEventType.ORDER_CONFIRMED.value,
                customer_id=customer_id,
                guest_token_hash=guest_token_hash,
                order_id=order_id,
            )
        except Exception as e:
            logger.warning("Failed to dispatch order placement notification: %s", e)

        return order

    async def get_order(
        self,
        order_id: uuid.UUID,
        customer_id: uuid.UUID | None = None,
        guest_token_hash: str | None = None,
        guest_access_token: str | None = None,
    ) -> Order:
        """Fetches order by ID enforcing strict tenant isolation and anti-IDOR protection."""
        order = await self.repo.get_order_by_id(order_id)
        if not order:
            raise AppException(
                code="ORDER_NOT_FOUND",
                message="Order was not found.",
                status_code=404,
            )

        if customer_id:
            if order.customer_id != customer_id:
                raise AppException(
                    code="ORDER_NOT_FOUND",
                    message="Order was not found.",
                    status_code=404,
                )
        elif guest_token_hash:
            if (
                order.guest_token_hash != guest_token_hash
                or order.customer_id is not None
            ):
                raise AppException(
                    code="ORDER_NOT_FOUND",
                    message="Order was not found.",
                    status_code=404,
                )
        elif guest_access_token:
            token_hash = hashlib.sha256(
                guest_access_token.strip().encode("utf-8")
            ).hexdigest()
            if order.guest_access_token_hash != token_hash:
                raise AppException(
                    code="ORDER_NOT_FOUND",
                    message="Order was not found.",
                    status_code=404,
                )
        else:
            raise AppException(
                code="ORDER_NOT_FOUND",
                message="Order was not found.",
                status_code=404,
            )

        return order

    async def guest_order_lookup(
        self,
        order_number: str,
        access_token: str,
    ) -> Order:
        """Performs secure guest order lookup using unguessable access token."""
        token_hash = hashlib.sha256(access_token.strip().encode("utf-8")).hexdigest()
        order = await self.repo.get_order_by_number_and_guest_token_hash(
            order_number.strip(), token_hash
        )
        if not order:
            raise AppException(
                code="ORDER_NOT_FOUND",
                message="Order not found or invalid access token.",
                status_code=404,
            )
        order.guest_access_token = access_token.strip()
        return order

    async def list_orders(
        self,
        customer_id: uuid.UUID | None = None,
        guest_token_hash: str | None = None,
        status: str | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        search: str | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """Lists orders with search, filtering, and pagination."""
        if not customer_id and not guest_token_hash:
            raise AppException(
                code="UNAUTHORIZED",
                message="Authentication or guest session is required.",
                status_code=401,
            )

        orders, total = await self.repo.list_orders(
            customer_id=customer_id,
            guest_token_hash=guest_token_hash,
            status=status,
            from_date=from_date,
            to_date=to_date,
            search=search,
            skip=skip,
            limit=limit,
        )

        items = [
            {
                "id": o.id,
                "order_number": o.order_number,
                "status": o.status,
                "payment_status": o.payment_status,
                "total_payable_paise": o.total_payable_paise,
                "currency": o.currency,
                "item_count": sum(item.quantity for item in o.items),
                "cancellation_reason": o.cancellation_reason,
                "cancelled_at": o.cancelled_at,
                "delivered_at": o.delivered_at,
                "created_at": o.created_at,
            }
            for o in orders
        ]
        return items, total

    async def cancel_order(
        self,
        order_id: uuid.UUID,
        reason: str = "CUSTOMER_CANCELLED",
        customer_id: uuid.UUID | None = None,
        guest_token_hash: str | None = None,
        guest_access_token: str | None = None,
        idempotency_key: str | None = None,
    ) -> OrderCancellationResponse:
        """Transactionally cancels an order before shipment, restocks inventory, and triggers refund."""
        order = await self.repo.get_order_by_id_for_update(order_id)
        if not order:
            raise AppException(
                code="ORDER_NOT_FOUND",
                message="Order was not found.",
                status_code=404,
            )

        # Ownership validation (if tenant identifiers provided)
        if customer_id:
            if order.customer_id != customer_id:
                raise AppException(
                    code="ORDER_NOT_FOUND",
                    message="Order was not found.",
                    status_code=404,
                )
        elif guest_token_hash:
            if (
                order.guest_token_hash != guest_token_hash
                or order.customer_id is not None
            ):
                raise AppException(
                    code="ORDER_NOT_FOUND",
                    message="Order was not found.",
                    status_code=404,
                )
        elif guest_access_token:
            token_hash = hashlib.sha256(
                guest_access_token.strip().encode("utf-8")
            ).hexdigest()
            if order.guest_access_token_hash != token_hash:
                raise AppException(
                    code="ORDER_NOT_FOUND",
                    message="Order was not found.",
                    status_code=404,
                )

        # Idempotency check: if already cancelled, return existing order
        now = datetime.now(UTC)
        if order.status == OrderStatus.CANCELLED.value:
            return order

        # Eligibility check: cancellation is only allowed BEFORE shipment
        cancellable_states = (
            OrderStatus.PENDING_PAYMENT.value,
            OrderStatus.CONFIRMED.value,
            OrderStatus.PROCESSING.value,
            OrderStatus.PACKED.value,
        )
        if order.status not in cancellable_states:
            raise AppException(
                code="ORDER_CANNOT_BE_CANCELLED",
                message=f"Order in status '{order.status}' cannot be cancelled. Orders that have shipped must follow the returns process.",
                status_code=400,
            )

        from_status = order.status
        order.version += 1
        order.status = OrderStatus.CANCELLED.value
        order.cancellation_reason = reason
        order.cancelled_at = now

        # Inventory restoration:
        # 1. If unpaid (PENDING_PAYMENT): release reservation hold
        # 2. If paid/confirmed (CONFIRMED, PROCESSING, PACKED): restock on-hand quantity
        if from_status == OrderStatus.PENDING_PAYMENT.value and order.reservation_id:
            try:
                res_service = ReservationService(self.session)
                await res_service.release_reservation(
                    reservation_id=order.reservation_id,
                    reason=f"ORDER_CANCELLED: {reason}",
                    internal=True,
                )
            except Exception as e:
                logger.warning(
                    "Failed to release reservation for cancelled order %s: %s",
                    order.id,
                    e,
                )
        elif from_status in (
            OrderStatus.CONFIRMED.value,
            OrderStatus.PROCESSING.value,
            OrderStatus.PACKED.value,
        ):
            try:
                res_service = ReservationService(self.session)
                restock_items = [
                    (item.listing_id, item.quantity) for item in order.items
                ]
                await res_service.restock_inventory_items(restock_items)
            except Exception as e:
                logger.warning(
                    "Failed to restock inventory for cancelled order %s: %s",
                    order.id,
                    e,
                )

        # Version 2.0: an unpaid order gives its discount uses back (once).
        if (
            from_status == OrderStatus.PENDING_PAYMENT.value
            and order.fulfilling_capture_id is None
        ):
            from app.modules.pricing.redemptions import release_discount_usage

            await release_discount_usage(
                self.session, order_id=order.id, reason="ORDER_CANCELLED_UNPAID"
            )

        # Payment refund handling:
        refund_status: str | None = None
        refund_amount_paise: int | None = None
        if from_status == OrderStatus.PENDING_PAYMENT.value:
            order.payment_status = PaymentStatus.FAILED.value
        elif order.payment_status == PaymentStatus.SUCCEEDED.value:
            try:
                payment_service = PaymentService(self.session)
                refund_req = CreateRefundRequest(
                    amount_paise=order.total_payable_paise,
                    reason=f"Customer cancellation: {reason}",
                    capture_id=order.fulfilling_capture_id,
                )
                refund_key = (
                    idempotency_key or f"cancel_refund_{order.id}_{order.version}"
                )
                refund_resp = await payment_service.create_refund(
                    order_id=order.id,
                    req=refund_req,
                    idempotency_key=refund_key,
                    is_internal=True,
                )
                refund_status = refund_resp.status
                refund_amount_paise = refund_resp.amount_paise
                order.payment_status = PaymentStatus.REFUNDED.value
            except Exception as e:
                logger.warning(
                    "Payment refund initiation failed on cancel for order %s: %s",
                    order.id,
                    e,
                )
                refund_status = "REFUND_PENDING"

        history = OrderStatusHistory(
            order_id=order.id,
            from_status=from_status,
            to_status=OrderStatus.CANCELLED.value,
            reason=reason,
        )
        self.session.add(history)

        outbox_payload = {
            "order_id": str(order.id),
            "order_number": order.order_number,
            "status": order.status,
            "payment_status": order.payment_status,
            "cancel_reason": reason,
            "cancelled_at": now.isoformat(),
            "refund_status": refund_status,
            "refund_amount_paise": refund_amount_paise,
            "aggregate_version": order.version,
        }
        await self.repo.create_outbox_event(
            aggregate_type="order",
            aggregate_id=order.id,
            event_type="order.cancelled",
            schema_version=1,
            payload=outbox_payload,
            aggregate_version=order.version,
        )

        # In-app notification
        try:
            await InAppNotificationDispatcher.dispatch(
                session=self.session,
                title="Order Cancelled",
                message=f"Order #{order.order_number} has been cancelled. Reason: {reason}",
                event_type=NotificationEventType.ORDER_CANCELLED.value,
                customer_id=order.customer_id,
                guest_token_hash=order.guest_token_hash,
                order_id=order.id,
            )
            email_prov = get_email_provider()
            await email_prov.send(
                recipient=order.customer_id and str(order.customer_id) or "guest",
                subject=f"BASKET Order Cancelled: #{order.order_number}",
                body=f"Your order #{order.order_number} was cancelled.",
                event_type=NotificationEventType.ORDER_CANCELLED.value,
            )
            sms_prov = get_sms_provider()
            await sms_prov.send(
                recipient=order.customer_id and str(order.customer_id) or "guest",
                subject="Order Cancelled",
                body=f"Your BASKET order #{order.order_number} has been cancelled.",
                event_type=NotificationEventType.ORDER_CANCELLED.value,
            )
        except Exception as e:
            logger.warning(
                "Notification dispatch failed for cancelled order %s: %s", order.id, e
            )

        await self.session.flush()
        return order

    async def create_shipment(
        self,
        order_id: uuid.UUID,
        req: CreateShipmentRequest,
    ) -> Shipment:
        """Creates a shipment record for an order, supporting partial fulfillments."""
        order = await self.repo.get_order_by_id_for_update(order_id)
        if not order:
            raise AppException(
                code="ORDER_NOT_FOUND",
                message="Order was not found.",
                status_code=404,
            )

        valid_shipment_states = (
            OrderStatus.CONFIRMED.value,
            OrderStatus.PROCESSING.value,
            OrderStatus.PACKED.value,
            OrderStatus.SHIPPED.value,
        )
        if order.status not in valid_shipment_states:
            raise AppException(
                code="INVALID_ORDER_STATE",
                message=f"Cannot create shipment for order in status '{order.status}'.",
                status_code=400,
            )

        carrier_prov = get_carrier_provider()
        if not carrier_prov.validate_tracking_number(
            req.carrier_code, req.tracking_number
        ):
            raise AppException(
                code="INVALID_TRACKING_NUMBER",
                message="Tracking number format is invalid for selected carrier.",
                status_code=400,
            )

        tracking_url = req.tracking_url or carrier_prov.build_tracking_url(
            req.carrier_code, req.tracking_number
        )

        now = datetime.now(UTC)
        shipment_number = f"SHP-{uuid.uuid4().hex[:8].upper()}"

        initial_history = [
            {
                "status": ShipmentStatus.LABEL_CREATED.value,
                "description": f"Shipment created with carrier {req.carrier_name}",
                "location": "Warehouse",
                "timestamp": now.isoformat(),
            }
        ]

        shipment = Shipment(
            id=uuid.uuid4(),
            order_id=order.id,
            shipment_number=shipment_number,
            carrier_name=req.carrier_name,
            carrier_code=req.carrier_code.upper(),
            tracking_number=req.tracking_number,
            tracking_url=tracking_url,
            status=ShipmentStatus.LABEL_CREATED.value,
            shipped_at=now,
            estimated_delivery_at=req.estimated_delivery_at,
            notes=req.notes,
            carrier_event_history=initial_history,
        )

        # Map shipment items
        order_item_map = {item.id: item for item in order.items}
        if req.items:
            for ship_item_input in req.items:
                if ship_item_input.order_item_id not in order_item_map:
                    raise AppException(
                        code="INVALID_ORDER_ITEM",
                        message=f"Order item {ship_item_input.order_item_id} does not belong to this order.",
                        status_code=400,
                    )
                shipment.items.append(
                    ShipmentItem(
                        id=uuid.uuid4(),
                        shipment_id=shipment.id,
                        order_item_id=ship_item_input.order_item_id,
                        quantity=ship_item_input.quantity,
                    )
                )
        else:
            for o_item in order.items:
                shipment.items.append(
                    ShipmentItem(
                        id=uuid.uuid4(),
                        shipment_id=shipment.id,
                        order_item_id=o_item.id,
                        quantity=o_item.quantity,
                    )
                )

        self.repo.add_shipment(shipment)

        # Update order status to SHIPPED if not already
        if order.status != OrderStatus.SHIPPED.value:
            from_status = order.status
            order.status = OrderStatus.SHIPPED.value
            order.version += 1
            history = OrderStatusHistory(
                order_id=order.id,
                from_status=from_status,
                to_status=OrderStatus.SHIPPED.value,
                reason=f"Dispatched via {req.carrier_name} ({req.tracking_number})",
            )
            self.session.add(history)

        outbox_payload = {
            "order_id": str(order.id),
            "order_number": order.order_number,
            "shipment_id": str(shipment.id),
            "shipment_number": shipment.shipment_number,
            "carrier_name": shipment.carrier_name,
            "carrier_code": shipment.carrier_code,
            "tracking_number": shipment.tracking_number,
            "tracking_url": shipment.tracking_url,
            "status": shipment.status,
            "created_at": now.isoformat(),
        }
        await self.repo.create_outbox_event(
            aggregate_type="order",
            aggregate_id=order.id,
            event_type="order.shipped",
            schema_version=1,
            payload=outbox_payload,
            aggregate_version=order.version,
        )

        try:
            await InAppNotificationDispatcher.dispatch(
                session=self.session,
                title="Order Shipped",
                message=f"Your order #{order.order_number} has been shipped via {shipment.carrier_name}. Tracking: {shipment.tracking_number}",
                event_type=NotificationEventType.ORDER_SHIPPED.value,
                customer_id=order.customer_id,
                guest_token_hash=order.guest_token_hash,
                order_id=order.id,
            )
        except Exception as e:
            logger.warning("Failed to dispatch order shipped notification: %s", e)

        await self.session.flush()
        return shipment

    async def update_shipment_status(
        self,
        order_id: uuid.UUID,
        shipment_id: uuid.UUID,
        req: UpdateShipmentStatusRequest,
    ) -> Shipment:
        """Updates shipment tracking status and synchronizes overall order lifecycle."""
        shipment = await self.repo.get_shipment_by_id_for_update(shipment_id)
        if not shipment or shipment.order_id != order_id:
            raise AppException(
                code="SHIPMENT_NOT_FOUND",
                message="Shipment was not found.",
                status_code=404,
            )

        order = await self.repo.get_order_by_id_for_update(order_id)
        if not order:
            raise AppException(
                code="ORDER_NOT_FOUND",
                message="Order was not found.",
                status_code=404,
            )

        now = datetime.now(UTC)
        prev_status = shipment.status
        prev_order_status = order.status
        target_status = req.status.strip().upper()

        if target_status not in [s.value for s in ShipmentStatus]:
            raise AppException(
                code="INVALID_SHIPMENT_STATUS",
                message=f"Status '{target_status}' is not a valid shipment status.",
                status_code=400,
            )

        if order.status in _SHIPMENT_FROZEN_ORDER_STATES:
            raise AppException(
                code="INVALID_ORDER_STATE",
                message=f"Cannot update shipments for an order in status '{order.status}'.",
                status_code=409,
            )

        if target_status == prev_status:
            # Idempotent no-op: do not duplicate history, notifications or events.
            return shipment
        if target_status not in SHIPMENT_STATUS_TRANSITIONS.get(
            prev_status, frozenset()
        ):
            raise AppException(
                code="INVALID_SHIPMENT_TRANSITION",
                message=f"Shipment cannot move from '{prev_status}' to '{target_status}'.",
                status_code=409,
            )

        shipment.status = target_status
        if req.notes:
            shipment.notes = req.notes

        # Append to tracking event log
        event_entry = {
            "status": target_status,
            "description": req.notes or f"Shipment status updated to {target_status}",
            "location": req.location or "In Transit",
            "timestamp": now.isoformat(),
        }
        history_list = list(shipment.carrier_event_history or [])
        history_list.append(event_entry)
        shipment.carrier_event_history = history_list

        # Lifecycle synchronization with order:
        if target_status == ShipmentStatus.OUT_FOR_DELIVERY.value:
            if order.status != OrderStatus.OUT_FOR_DELIVERY.value:
                order.status = OrderStatus.OUT_FOR_DELIVERY.value
                order.version += 1
                self.session.add(
                    OrderStatusHistory(
                        order_id=order.id,
                        from_status=prev_order_status,
                        to_status=OrderStatus.OUT_FOR_DELIVERY.value,
                        reason="Out for delivery",
                    )
                )
                try:
                    await InAppNotificationDispatcher.dispatch(
                        session=self.session,
                        title="Out for Delivery",
                        message=f"Order #{order.order_number} is out for delivery today!",
                        event_type=NotificationEventType.ORDER_OUT_FOR_DELIVERY.value,
                        customer_id=order.customer_id,
                        guest_token_hash=order.guest_token_hash,
                        order_id=order.id,
                    )
                except Exception as e:
                    logger.warning(
                        "Failed to dispatch out for delivery notification: %s", e
                    )

        elif target_status == ShipmentStatus.DELIVERED.value:
            shipment.delivered_at = now
            # Partial fulfilment: the order is only DELIVERED once every
            # non-cancelled shipment of the order has been delivered.
            from sqlalchemy import select as _select

            sibling_statuses = (
                (
                    await self.session.execute(
                        _select(Shipment.status).where(
                            Shipment.order_id == order.id, Shipment.id != shipment.id
                        )
                    )
                )
                .scalars()
                .all()
            )
            if any(
                s
                not in (ShipmentStatus.DELIVERED.value, ShipmentStatus.CANCELLED.value)
                for s in sibling_statuses
            ):
                await self.session.flush()
                return shipment
            order.status = OrderStatus.DELIVERED.value
            order.delivered_at = now
            order.version += 1
            self.session.add(
                OrderStatusHistory(
                    order_id=order.id,
                    from_status=prev_order_status,
                    to_status=OrderStatus.DELIVERED.value,
                    reason="Package delivered",
                )
            )
            await self.repo.create_outbox_event(
                aggregate_type="order",
                aggregate_id=order.id,
                event_type="order.delivered",
                schema_version=1,
                payload={
                    "order_id": str(order.id),
                    "order_number": order.order_number,
                    "delivered_at": now.isoformat(),
                },
                aggregate_version=order.version,
            )
            try:
                await InAppNotificationDispatcher.dispatch(
                    session=self.session,
                    title="Order Delivered",
                    message=f"Order #{order.order_number} has been delivered successfully. Thank you for shopping with BASKET!",
                    event_type=NotificationEventType.ORDER_DELIVERED.value,
                    customer_id=order.customer_id,
                    guest_token_hash=order.guest_token_hash,
                    order_id=order.id,
                )
            except Exception as e:
                logger.warning("Failed to dispatch order delivered notification: %s", e)

        await self.session.flush()
        return shipment

    async def get_order_tracking(
        self,
        order_id: uuid.UUID,
        customer_id: uuid.UUID | None = None,
        guest_token_hash: str | None = None,
        guest_access_token: str | None = None,
    ) -> OrderTrackingResponse:
        """Retrieves comprehensive tracking status, timeline milestones, and carrier events."""
        order = await self.get_order(
            order_id=order_id,
            customer_id=customer_id,
            guest_token_hash=guest_token_hash,
            guest_access_token=guest_access_token,
        )

        # Primary shipment (if any)
        primary_shipment = order.shipments[0] if order.shipments else None

        # Build chronological milestones
        status_rank = {
            OrderStatus.PENDING_PAYMENT.value: 0,
            OrderStatus.CONFIRMED.value: 1,
            OrderStatus.PROCESSING.value: 2,
            OrderStatus.PACKED.value: 3,
            OrderStatus.SHIPPED.value: 4,
            OrderStatus.OUT_FOR_DELIVERY.value: 5,
            OrderStatus.DELIVERED.value: 6,
            OrderStatus.CANCELLED.value: -1,
            OrderStatus.RETURNED.value: 7,
        }
        current_rank = status_rank.get(order.status, 0)

        milestones_def = [
            (
                OrderStatus.PENDING_PAYMENT.value,
                "Order Placed",
                "Your order has been placed in our system.",
                0,
            ),
            (
                OrderStatus.CONFIRMED.value,
                "Order Confirmed",
                "Payment verified and inventory allocated.",
                1,
            ),
            (
                OrderStatus.PROCESSING.value,
                "Processing",
                "Order is being prepared by retailers.",
                2,
            ),
            (
                OrderStatus.PACKED.value,
                "Packed",
                "Items inspected and safely packaged.",
                3,
            ),
            (
                OrderStatus.SHIPPED.value,
                "Shipped",
                "Dispatched with logistics carrier.",
                4,
            ),
            (
                OrderStatus.OUT_FOR_DELIVERY.value,
                "Out for Delivery",
                "Package is on the vehicle for delivery.",
                5,
            ),
            (
                OrderStatus.DELIVERED.value,
                "Delivered",
                "Delivered to recipient address.",
                6,
            ),
        ]

        timeline: list[OrderTrackingTimelineEvent] = []
        for state_val, title, desc, rank in milestones_def:
            completed = current_rank >= rank if current_rank >= 0 else False
            is_current = order.status == state_val
            timeline.append(
                OrderTrackingTimelineEvent(
                    status=state_val,
                    title=title,
                    description=desc,
                    timestamp=order.delivered_at
                    if state_val == OrderStatus.DELIVERED.value
                    else order.created_at,
                    completed=completed,
                    current=is_current,
                )
            )

        return OrderTrackingResponse(
            order_id=order.id,
            order_number=order.order_number,
            order_status=order.status,
            carrier_name=primary_shipment.carrier_name if primary_shipment else None,
            carrier_code=primary_shipment.carrier_code if primary_shipment else None,
            tracking_number=primary_shipment.tracking_number
            if primary_shipment
            else None,
            tracking_url=primary_shipment.tracking_url if primary_shipment else None,
            estimated_delivery_at=primary_shipment.estimated_delivery_at
            if primary_shipment
            else None,
            delivered_at=order.delivered_at,
            shipments=order.shipments,
            timeline=timeline,
        )

    async def request_return(
        self,
        order_id: uuid.UUID,
        req: ReturnCreateRequest,
        customer_id: uuid.UUID | None = None,
        guest_token_hash: str | None = None,
        guest_access_token: str | None = None,
    ) -> OrderReturn:
        """Processes customer return request with item-level reasons and returns policy window check."""
        order = await self.repo.get_order_by_id_for_update(order_id)
        if not order:
            raise AppException(
                code="ORDER_NOT_FOUND",
                message="Order was not found.",
                status_code=404,
            )

        if customer_id:
            if order.customer_id != customer_id:
                raise AppException(
                    code="ORDER_NOT_FOUND",
                    message="Order was not found.",
                    status_code=404,
                )
        elif guest_token_hash:
            if (
                order.guest_token_hash != guest_token_hash
                or order.customer_id is not None
            ):
                raise AppException(
                    code="ORDER_NOT_FOUND",
                    message="Order was not found.",
                    status_code=404,
                )
        elif guest_access_token:
            token_hash = hashlib.sha256(
                guest_access_token.strip().encode("utf-8")
            ).hexdigest()
            if order.guest_access_token_hash != token_hash:
                raise AppException(
                    code="ORDER_NOT_FOUND",
                    message="Order was not found.",
                    status_code=404,
                )
        else:
            raise AppException(
                code="ORDER_NOT_FOUND",
                message="Order was not found.",
                status_code=404,
            )

        # Eligibility check: must be DELIVERED
        if order.status != OrderStatus.DELIVERED.value:
            raise AppException(
                code="ORDER_NOT_ELIGIBLE_FOR_RETURN",
                message=f"Returns can only be requested for delivered orders. Current order status: {order.status}.",
                status_code=400,
            )

        # 15-day return policy window
        now = datetime.now(UTC)
        if order.delivered_at:
            deliv_time = (
                order.delivered_at
                if order.delivered_at.tzinfo
                else order.delivered_at.replace(tzinfo=UTC)
            )
            if (now - deliv_time) > timedelta(days=15):
                raise AppException(
                    code="RETURN_WINDOW_EXPIRED",
                    message="The 15-day return window for this order has expired.",
                    status_code=400,
                )

        # Item validation and refund calculation
        order_item_map = {item.id: item for item in order.items}
        total_refund_paise = 0
        return_items: list[ReturnItem] = []

        return_id = uuid.uuid4()
        return_number = f"RET-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

        for r_item in req.items:
            o_item = order_item_map.get(r_item.order_item_id)
            if not o_item:
                raise AppException(
                    code="INVALID_RETURN_ITEM",
                    message=f"Order item {r_item.order_item_id} does not belong to this order.",
                    status_code=400,
                )
            if r_item.quantity > o_item.quantity:
                raise AppException(
                    code="EXCESS_RETURN_QUANTITY",
                    message=f"Cannot return {r_item.quantity} units; order only contains {o_item.quantity}.",
                    status_code=400,
                )

            item_refund = o_item.unit_discounted_price_paise * r_item.quantity
            total_refund_paise += item_refund

            return_items.append(
                ReturnItem(
                    id=uuid.uuid4(),
                    return_id=return_id,
                    order_item_id=o_item.id,
                    quantity=r_item.quantity,
                    refund_subtotal_paise=item_refund,
                    restock_approved=False,
                )
            )

        order_return = OrderReturn(
            id=return_id,
            order_id=order.id,
            return_number=return_number,
            customer_id=order.customer_id,
            guest_token_hash=order.guest_token_hash,
            status=ReturnStatus.REQUESTED.value,
            reason=req.reason,
            customer_notes=req.customer_notes,
            refund_amount_paise=total_refund_paise,
            idempotency_key=req.idempotency_key,
            items=return_items,
            status_history=[
                ReturnStatusHistory(
                    id=uuid.uuid4(),
                    return_id=return_id,
                    from_status=None,
                    to_status=ReturnStatus.REQUESTED.value,
                    reason=req.reason,
                    actor="CUSTOMER",
                )
            ],
        )
        self.repo.add_return(order_return)

        outbox_payload = {
            "order_id": str(order.id),
            "order_number": order.order_number,
            "return_id": str(order_return.id),
            "return_number": order_return.return_number,
            "reason": req.reason,
            "refund_amount_paise": total_refund_paise,
            "status": order_return.status,
            "created_at": now.isoformat(),
        }
        await self.repo.create_outbox_event(
            aggregate_type="order_return",
            aggregate_id=order_return.id,
            event_type="order.return_requested",
            schema_version=1,
            payload=outbox_payload,
        )

        try:
            await InAppNotificationDispatcher.dispatch(
                session=self.session,
                title="Return Requested",
                message=f"Return #{return_number} has been requested for Order #{order.order_number}.",
                event_type=NotificationEventType.RETURN_REQUESTED.value,
                customer_id=order.customer_id,
                guest_token_hash=order.guest_token_hash,
                order_id=order.id,
            )
        except Exception as e:
            logger.warning("Failed to dispatch return requested notification: %s", e)

        await self.session.flush()
        return order_return

    async def update_return_status(
        self,
        return_id: uuid.UUID,
        req: ReturnStatusUpdateRequest,
        actor: str = "ADMIN",
    ) -> OrderReturn:
        """Updates return lifecycle, optionally approving restock and issuing refund.

        Transitions are validated against RETURN_STATUS_TRANSITIONS so restocking and
        refunds can only ever happen once per return.
        """
        ret = await self.repo.get_return_by_id_for_update(return_id)
        if not ret:
            raise AppException(
                code="RETURN_NOT_FOUND",
                message="Return was not found.",
                status_code=404,
            )

        order = await self.repo.get_order_by_id_for_update(ret.order_id)
        if not order:
            raise AppException(
                code="ORDER_NOT_FOUND",
                message="Associated order was not found.",
                status_code=404,
            )

        target_status = req.status.strip().upper()
        if target_status not in [s.value for s in ReturnStatus]:
            raise AppException(
                code="INVALID_RETURN_STATUS",
                message=f"Status '{target_status}' is not a valid return status.",
                status_code=400,
            )

        from_status = ret.status
        if target_status not in RETURN_STATUS_TRANSITIONS.get(from_status, frozenset()):
            raise AppException(
                code="INVALID_RETURN_TRANSITION",
                message=f"Return cannot move from '{from_status}' to '{target_status}'.",
                status_code=409,
            )
        ret.status = target_status
        now = datetime.now(UTC)

        if req.admin_notes:
            ret.admin_notes = req.admin_notes

        # Handle inspection & restocking
        if target_status == ReturnStatus.INSPECTED.value:
            ret.inspected_at = now
            if req.restock_approved:
                for r_item in ret.items:
                    r_item.restock_approved = True
                res_service = ReservationService(self.session)
                restock_items = [
                    (item.order_item.listing_id, item.quantity) for item in ret.items
                ]
                await res_service.restock_inventory_items(restock_items)

        # Handle refund processing
        if target_status == ReturnStatus.REFUNDED.value:
            ret.resolved_at = now
            if order.payment_status in (
                PaymentStatus.SUCCEEDED.value,
                PaymentStatus.PARTIALLY_REFUNDED.value,
            ):
                try:
                    payment_service = PaymentService(self.session)
                    refund_req = CreateRefundRequest(
                        amount_paise=ret.refund_amount_paise,
                        reason=f"Return refund #{ret.return_number}",
                        capture_id=order.fulfilling_capture_id,
                    )
                    refund_resp = await payment_service.create_refund(
                        order_id=order.id,
                        req=refund_req,
                        idempotency_key=f"ret_refund_{ret.id}",
                        is_internal=True,
                    )
                    ret.payment_refund_id = refund_resp.refund_id
                except Exception as e:
                    # Never report a refund that did not happen: park the return in
                    # REFUND_PENDING so operators / automation can retry it.
                    logger.warning(
                        "Refund processing failed for return %s: %s", ret.id, e
                    )
                    target_status = ReturnStatus.REFUND_PENDING.value
                    ret.status = target_status
                    ret.resolved_at = None

        # Append return history
        history = ReturnStatusHistory(
            id=uuid.uuid4(),
            return_id=ret.id,
            from_status=from_status,
            to_status=target_status,
            reason=req.admin_notes or f"Return transitioned to {target_status}",
            actor=actor[:64],
        )
        self.session.add(history)

        try:
            await InAppNotificationDispatcher.dispatch(
                session=self.session,
                title=f"Return Update: {target_status}",
                message=f"Return #{ret.return_number} has been updated to {target_status}.",
                event_type=f"RETURN_{target_status}",
                customer_id=ret.customer_id,
                guest_token_hash=ret.guest_token_hash,
                order_id=ret.order_id,
            )
        except Exception as e:
            logger.warning("Failed to dispatch return notification: %s", e)

        await self.session.flush()
        return ret

    async def list_returns_for_order(
        self,
        order_id: uuid.UUID,
        customer_id: uuid.UUID | None = None,
        guest_token_hash: str | None = None,
        guest_access_token: str | None = None,
    ) -> list[OrderReturn]:
        """Lists all returns associated with an order."""
        await self.get_order(
            order_id=order_id,
            customer_id=customer_id,
            guest_token_hash=guest_token_hash,
            guest_access_token=guest_access_token,
        )
        return await self.repo.list_returns_for_order(order_id)

    async def list_notifications(
        self,
        customer_id: uuid.UUID | None = None,
        guest_token_hash: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[CustomerNotification], int]:
        """Lists in-app notifications for caller."""
        return await self.repo.list_notifications(
            customer_id=customer_id,
            guest_token_hash=guest_token_hash,
            skip=skip,
            limit=limit,
        )

    async def get_unread_notification_count(
        self,
        customer_id: uuid.UUID | None = None,
        guest_token_hash: str | None = None,
    ) -> int:
        """Returns unread notification badge count."""
        return await self.repo.get_unread_notification_count(
            customer_id=customer_id,
            guest_token_hash=guest_token_hash,
        )

    async def mark_notification_as_read(
        self,
        notification_id: uuid.UUID,
        customer_id: uuid.UUID | None = None,
        guest_token_hash: str | None = None,
    ) -> bool:
        """Marks specific notification as read."""
        item = await self.repo.mark_notification_as_read(
            notification_id=notification_id,
            customer_id=customer_id,
            guest_token_hash=guest_token_hash,
        )
        await self.session.flush()
        return item is not None
