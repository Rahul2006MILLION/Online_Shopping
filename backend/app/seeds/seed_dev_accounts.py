"""Development Test Accounts Bootstrap & Seeding Script for BASKET.

Creates or resets development accounts for:
1. Platform Administrator (role='admin')
2. Verified Merchant / Retailer (role='retailer') with full store profile,
   verified compliance documents, audit trail, and active listings/inventory.

Credentials are saved locally to `.dev_credentials.env` (gitignored).
Usage:
    python -m app.seeds.seed_dev_accounts [--reset]
"""

import argparse
import asyncio
import os
import secrets
import string
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import delete, select

from app.core.database import get_session_factory
from app.modules.catalogue.models import (
    ProductListing,
    ProductVariant,
    Retailer,
    RetailerVerificationDocument,
    RetailerVerificationHistory,
    StoreInventory,
)
from app.modules.identity.models import User
from app.modules.identity.security import hash_password

DEV_CREDENTIALS_FILE = Path(__file__).resolve().parents[2] / ".dev_credentials.env"


def generate_strong_password(prefix: str = "B4sket") -> str:
    """Generate a high-entropy, compliant password with symbols, digits, and mixed-case letters."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    random_part = "".join(secrets.choice(alphabet) for _ in range(16))
    return f"{prefix}!{random_part}"


def load_existing_credentials() -> dict[str, str]:
    """Load existing credentials from .dev_credentials.env if present."""
    creds = {}
    if DEV_CREDENTIALS_FILE.exists():
        for line in DEV_CREDENTIALS_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                creds[key.strip()] = val.strip()
    return creds


def save_credentials(creds: dict[str, str]) -> None:
    """Save credentials to gitignored .dev_credentials.env file."""
    lines = [
        "# BASKET DEVELOPMENT TEST ACCOUNTS",
        f"# Generated/Updated: {datetime.now(UTC).isoformat()}",
        "# Development-only credentials. Never use or commit to production.",
        "",
    ]
    for k, v in creds.items():
        lines.append(f"{k}={v}")
    lines.append("")
    DEV_CREDENTIALS_FILE.write_text("\n".join(lines))
    # Also save to repository root for frontend convenience if possible
    repo_root_env = Path(__file__).resolve().parents[3] / ".dev_credentials.env"
    try:
        repo_root_env.write_text("\n".join(lines))
    except Exception:
        pass


async def seed_dev_accounts(reset: bool = False) -> dict[str, dict[str, str]]:
    """Seed or update development admin and retailer accounts idempotently."""
    session_factory = get_session_factory()
    existing_creds = load_existing_credentials() if not reset else {}

    admin_email = existing_creds.get("DEV_ADMIN_EMAIL", "admin.dev@basket.local")
    admin_password = existing_creds.get(
        "DEV_ADMIN_PASSWORD"
    ) or generate_strong_password(prefix="B4sket#Admin")

    retailer_email = existing_creds.get(
        "DEV_RETAILER_EMAIL", "retailer.dev@basket.local"
    )
    retailer_password = existing_creds.get(
        "DEV_RETAILER_PASSWORD"
    ) or generate_strong_password(prefix="B4sket#Retailer")

    async with session_factory() as session:
        # ----------------------------------------------------
        # 1. Admin Account Bootstrap
        # ----------------------------------------------------
        admin_user = (
            await session.execute(select(User).where(User.email == admin_email))
        ).scalar_one_or_none()

        admin_hashed = hash_password(admin_password)
        if not admin_user:
            admin_user = User(
                id=uuid.uuid4(),
                email=admin_email,
                full_name="Platform Admin (Dev)",
                phone="+919999900001",
                hashed_password=admin_hashed,
                role="admin",
                is_active=True,
            )
            session.add(admin_user)
            await session.flush()
        else:
            admin_user.hashed_password = admin_hashed
            admin_user.role = "admin"
            admin_user.is_active = True
            admin_user.full_name = "Platform Admin (Dev)"
            await session.flush()

        admin_id = admin_user.id

        # ----------------------------------------------------
        # 2. Retailer Account & Store Profile Bootstrap
        # ----------------------------------------------------
        retailer_user = (
            await session.execute(select(User).where(User.email == retailer_email))
        ).scalar_one_or_none()

        retailer_hashed = hash_password(retailer_password)
        if not retailer_user:
            retailer_user = User(
                id=uuid.uuid4(),
                email=retailer_email,
                full_name="Merchant Partner (Dev)",
                phone="+919999900002",
                hashed_password=retailer_hashed,
                role="retailer",
                is_active=True,
            )
            session.add(retailer_user)
            await session.flush()
        else:
            retailer_user.hashed_password = retailer_hashed
            retailer_user.role = "retailer"
            retailer_user.is_active = True
            retailer_user.full_name = "Merchant Partner (Dev)"
            await session.flush()

        retailer_user_id = retailer_user.id

        # Associated Retailer Store Record
        store_slug = "basket-superstore-dev"
        retailer_record = (
            await session.execute(select(Retailer).where(Retailer.slug == store_slug))
        ).scalar_one_or_none()

        if not retailer_record:
            # Check if user already owns another store record
            retailer_record = (
                await session.execute(
                    select(Retailer).where(Retailer.user_id == retailer_user_id)
                )
            ).scalar_one_or_none()

        now = datetime.now(UTC)
        if not retailer_record:
            retailer_record = Retailer(
                id=uuid.uuid4(),
                user_id=retailer_user_id,
                name="Basket Superstore (Dev Partner)",
                slug=store_slug,
                description="Official development flagship store for testing retailer operations and inventory management.",
                logo_url="https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=200",
                rating=4.9,
                state="KA",
                state_source="SEED",
                is_active=True,
                is_open=True,
                business_address="100 Feet Road, Indiranagar, Bengaluru, KA 560038",
                contact_phone="+919876543210",
                contact_email=retailer_email,
                verification_status="VERIFIED",
                reviewed_by_user_id=admin_id,
                verified_at=now,
            )
            session.add(retailer_record)
            await session.flush()
        else:
            retailer_record.user_id = retailer_user_id
            retailer_record.is_active = True
            retailer_record.is_open = True
            retailer_record.verification_status = "VERIFIED"
            retailer_record.reviewed_by_user_id = admin_id
            retailer_record.verified_at = now
            await session.flush()

        retailer_id = retailer_record.id

        # Ensure verified document exists
        doc = (
            await session.execute(
                select(RetailerVerificationDocument).where(
                    RetailerVerificationDocument.retailer_id == retailer_id
                )
            )
        ).scalar_one_or_none()

        if not doc:
            doc = RetailerVerificationDocument(
                id=uuid.uuid4(),
                retailer_id=retailer_id,
                document_type="GST_CERTIFICATE",
                document_url="https://dev-docs.basket.local/gstin-dev-cert.pdf",
                status="VERIFIED",
            )
            session.add(doc)

        # Ensure verification history audit record exists
        history = (
            await session.execute(
                select(RetailerVerificationHistory).where(
                    RetailerVerificationHistory.retailer_id == retailer_id
                )
            )
        ).scalars().first()

        if not history:
            history = RetailerVerificationHistory(
                id=uuid.uuid4(),
                retailer_id=retailer_id,
                admin_id=admin_id,
                action="APPROVED",
                from_status="PENDING",
                to_status="VERIFIED",
                reason="Standard development onboarding and verification bootstrap",
            )
            session.add(history)

        # ----------------------------------------------------
        # 3. Sample Listings & Inventory for Dev Retailer
        # ----------------------------------------------------
        # Pick 2 active canonical variants from existing products
        variants = (
            (
                await session.execute(
                    select(ProductVariant)
                    .where(ProductVariant.is_active.is_(True))
                    .limit(2)
                )
            )
            .scalars()
            .all()
        )

        for i, var in enumerate(variants):
            existing_listing = (
                await session.execute(
                    select(ProductListing).where(
                        ProductListing.retailer_id == retailer_id,
                        ProductListing.variant_id == var.id,
                    )
                )
            ).scalar_one_or_none()

            if not existing_listing:
                base_mrp = 299900
                selling_price = 249900
                listing = ProductListing(
                    id=uuid.uuid4(),
                    retailer_id=retailer_id,
                    variant_id=var.id,
                    original_price_paise=base_mrp,
                    selling_price_paise=selling_price,
                    currency="INR",
                    seller_sku=f"DEV-SKU-{var.sku}-{i+1}",
                    is_active=True,
                )
                session.add(listing)
                await session.flush()

                inventory = StoreInventory(
                    listing_id=listing.id,
                    on_hand_quantity=50,
                    reserved_quantity=0,
                    low_stock_threshold=10,
                )
                session.add(inventory)
            else:
                existing_listing.is_active = True
                # Ensure inventory exists
                inv = (
                    await session.execute(
                        select(StoreInventory).where(
                            StoreInventory.listing_id == existing_listing.id
                        )
                    )
                ).scalar_one_or_none()
                if not inv:
                    session.add(
                        StoreInventory(
                            listing_id=existing_listing.id,
                            on_hand_quantity=50,
                            reserved_quantity=0,
                            low_stock_threshold=10,
                        )
                    )
                elif inv.on_hand_quantity < 10:
                    inv.on_hand_quantity = 50

        await session.commit()

    # Save credentials locally
    creds_to_save = {
        "DEV_ADMIN_EMAIL": admin_email,
        "DEV_ADMIN_PASSWORD": admin_password,
        "DEV_RETAILER_EMAIL": retailer_email,
        "DEV_RETAILER_PASSWORD": retailer_password,
    }
    save_credentials(creds_to_save)

    return {
        "admin": {
            "email": admin_email,
            "password": admin_password,
            "role": "admin",
            "name": "Platform Admin (Dev)",
        },
        "retailer": {
            "email": retailer_email,
            "password": retailer_password,
            "role": "retailer",
            "name": "Merchant Partner (Dev)",
            "store_name": "Basket Superstore (Dev Partner)",
            "store_slug": store_slug,
        },
    }


def main():
    parser = argparse.ArgumentParser(
        description="Bootstrap BASKET development test accounts."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Regenerate new random passwords even if existing credentials file exists.",
    )
    args = parser.parse_args()

    results = asyncio.run(seed_dev_accounts(reset=args.reset))
    print("\n" + "=" * 60)
    print("BASKET DEVELOPMENT TEST ACCOUNTS BOOTSTRAP COMPLETE")
    print("=" * 60)
    print(f"Admin Email:     {results['admin']['email']}")
    print(f"Admin Password:  {results['admin']['password']}")
    print(f"Retailer Email:  {results['retailer']['email']}")
    print(f"Retailer Pass:   {results['retailer']['password']}")
    print(f"Retailer Store:  {results['retailer']['store_name']}")
    print(f"Saved to:        {DEV_CREDENTIALS_FILE}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
