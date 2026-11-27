import hmac
import uuid
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.exceptions import AppException
from app.modules.identity.models import User
from app.modules.identity.repository import IdentityRepository
from app.modules.identity.security import decode_access_token


def get_client_ip(request: Request) -> str:
    """Extract the client IP address.

    X-Forwarded-For is client-controlled, so it is only honoured when the app is
    explicitly configured to sit behind a known number of trusted reverse proxies
    (TRUSTED_PROXY_COUNT > 0). In that case the address appended by the outermost
    trusted proxy is used. Otherwise the direct peer address is used, which stops
    attackers from rotating spoofed IPs to bypass the login rate limiter.
    """
    from app.core.config import settings

    trusted_hops = int(getattr(settings, "TRUSTED_PROXY_COUNT", 0) or 0)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if trusted_hops > 0 and forwarded_for:
        hops = [h.strip() for h in forwarded_for.split(",") if h.strip()]
        if hops:
            return hops[-trusted_hops] if len(hops) >= trusted_hops else hops[0]
    if request.client:
        return request.client.host
    return "127.0.0.1"


async def get_current_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Extract and validate user from Authorization header or HTTP-only cookie."""
    token: str | None = None

    # Check Authorization header first
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()

    # Fall back to access_token cookie
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        raise AppException(
            code="NOT_AUTHENTICATED",
            message="Authentication credentials were not provided.",
            status_code=401,
        )

    payload = decode_access_token(token)
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise AppException(
            code="INVALID_TOKEN",
            message="Token payload is missing subject.",
            status_code=401,
        )

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise AppException(
            code="INVALID_TOKEN",
            message="Malformed user identifier in token.",
            status_code=401,
        ) from None

    repo = IdentityRepository(db)

    # Instantaneous session revocation check
    sid_str = payload.get("sid")
    if sid_str:
        try:
            session_id = uuid.UUID(sid_str)
            session = await repo.get_session_by_id(session_id)
            if (
                not session
                or session.is_revoked
                or getattr(session, "user_id", user_id) != user_id
            ):
                raise AppException(
                    code="SESSION_REVOKED",
                    message="Session has been revoked or logged out.",
                    status_code=401,
                )
        except ValueError:
            raise AppException(
                code="INVALID_TOKEN",
                message="Malformed session identifier in token.",
                status_code=401,
            ) from None

    user = await repo.get_user_by_id(user_id)
    if not user:
        raise AppException(
            code="USER_NOT_FOUND",
            message="User account no longer exists.",
            status_code=401,
        )

    if not user.is_active:
        raise AppException(
            code="USER_INACTIVE",
            message="User account is deactivated.",
            status_code=403,
        )

    # Exposed to middleware (admin audit trail); never used for authorisation.
    request.state.auth_user_id = user.id
    request.state.auth_user_email = user.email
    request.state.auth_role = user.role
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not current_user.is_active:
        raise AppException(
            code="USER_INACTIVE",
            message="User account is deactivated.",
            status_code=403,
        )
    return current_user


def require_role(required_role: str):
    async def role_checker(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if current_user.role != required_role:
            raise AppException(
                code="FORBIDDEN",
                message=f"Insufficient permissions. Required role: {required_role}.",
                status_code=403,
            )
        return current_user

    return role_checker


require_admin = require_role("admin")
require_retailer = require_role("retailer")


async def get_current_retailer(
    current_user: Annotated[User, Depends(require_role("retailer"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Resolve the retailer store entity associated with the authenticated retailer account."""
    from sqlalchemy import select

    from app.modules.catalogue.models import Retailer

    stmt = select(Retailer).where(Retailer.user_id == current_user.id)
    result = await db.execute(stmt)
    retailer = result.scalar_one_or_none()
    if not retailer:
        raise AppException(
            code="RETAILER_NOT_FOUND",
            message="No retailer profile associated with this account.",
            status_code=404,
        )
    return retailer


_CSRF_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})


def _is_local_dev_origin(origin: str) -> bool:
    """Validate dev/LAN origins (localhost, RFC-1918 private IPs, local tunnels)."""
    import ipaddress
    from urllib.parse import urlsplit

    from app.core.config import settings

    if settings.is_production:
        return False

    try:
        host = (urlsplit(origin).hostname or "").lower()
    except ValueError:
        return False

    if not host:
        return False

    if host in {"localhost", "127.0.0.1", "::1"}:
        return True

    try:
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback
    except ValueError:
        pass

    if host.endswith(".trycloudflare.com"):
        sub = host[: -len(".trycloudflare.com")]
        if sub and "." not in sub and all(c.isalnum() or c == "-" for c in sub):
            return True

    if host.endswith(".vercel.app"):
        sub = host[: -len(".vercel.app")]
        if sub and "." not in sub and all(c.isalnum() or c == "-" for c in sub):
            return True

    return False


async def verify_csrf_token(
    request: Request,
    x_csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> None:
    """Verify CSRF token and origin for cookie-based state-mutating requests.

    Safe (read-only) methods are exempt so this dependency can be attached at
    router level without breaking GET requests.
    """
    if request.method.upper() in _CSRF_SAFE_METHODS:
        return
    # If the request authenticates via explicit Authorization header, ambient CSRF is not applicable
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return

    # Only enforce if request relies on cookie auth
    access_cookie = request.cookies.get("access_token")
    if not access_cookie:
        return

    # 1. Validate Origin header if present
    origin = request.headers.get("Origin")
    if origin:
        from app.core.config import settings

        allowed_origins = set(settings.CORS_ORIGINS) | {
            "http://testserver",
            "https://testserver",
        }
        origin_base = origin.rstrip("/")
        is_allowed = any(
            origin_base == allowed.rstrip("/") for allowed in allowed_origins
        )
        if not is_allowed and settings.cors_origin_regex:
            import re

            if re.match(settings.cors_origin_regex, origin):
                is_allowed = True

        if not is_allowed and (
            settings.is_production or not _is_local_dev_origin(origin_base)
        ):
            raise AppException(
                code="CSRF_ORIGIN_INVALID",
                message="Cross-origin request forbidden.",
                status_code=403,
            )

    # 2. Validate double-submit cookie
    csrf_cookie = request.cookies.get("XSRF-TOKEN")
    if not csrf_cookie or not x_csrf_token:
        raise AppException(
            code="CSRF_TOKEN_MISSING",
            message="CSRF token missing from cookie or header.",
            status_code=403,
        )

    if not hmac.compare_digest(csrf_cookie, x_csrf_token):
        raise AppException(
            code="CSRF_TOKEN_INVALID",
            message="CSRF token validation failed.",
            status_code=403,
        )


async def require_admin_or_internal_service(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> str:
    """Authorise privileged operational endpoints (fulfilment, returns, refunds).

    Accepts either a valid internal service key (X-Internal-Service-Key /
    X-Internal-Token) for back-office automation, or an authenticated ADMIN user.
    Cookie-authenticated admins must also pass CSRF validation.
    Returns an actor label for audit history.
    """
    from app.core.config import settings

    internal_key = request.headers.get("X-Internal-Service-Key") or request.headers.get(
        "X-Internal-Token"
    )
    if internal_key and settings.INTERNAL_SERVICE_KEY:
        configured = settings.INTERNAL_SERVICE_KEY.get_secret_value()
        if configured and hmac.compare_digest(internal_key, configured):
            return "INTERNAL_SERVICE"

    user = await get_current_user(request, db)
    if user.role != "admin":
        raise AppException(
            code="FORBIDDEN",
            message="Insufficient permissions. Required role: admin.",
            status_code=403,
        )
    await verify_csrf_token(request, request.headers.get("X-CSRF-Token"))
    return f"ADMIN:{user.id}"
