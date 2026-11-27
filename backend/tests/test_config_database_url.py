"""DATABASE_URL normalisation for managed Postgres hosts (Render, Railway, Heroku)."""

import pytest

from app.core.config import Settings


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (
            "postgres://u:p@dpg-abc-a:5432/basket",
            "postgresql+asyncpg://u:p@dpg-abc-a:5432/basket",
        ),
        (
            "postgresql://u:p@dpg-abc-a/basket",
            "postgresql+asyncpg://u:p@dpg-abc-a/basket",
        ),
        (
            "postgresql+asyncpg://u:p@localhost:5432/basket_db",
            "postgresql+asyncpg://u:p@localhost:5432/basket_db",
        ),
        ("  postgresql://u:p@h/db  ", "postgresql+asyncpg://u:p@h/db"),
        ("sqlite+aiosqlite:///./test.db", "sqlite+aiosqlite:///./test.db"),
    ],
)
def test_database_url_scheme_is_normalised_to_asyncpg(raw: str, expected: str) -> None:
    settings = Settings(_env_file=None, DATABASE_URL=raw)
    assert settings.DATABASE_URL == expected


def test_missing_database_url_stays_unset() -> None:
    settings = Settings(_env_file=None, DATABASE_URL=None)
    assert settings.DATABASE_URL is None
    assert settings.has_database is False
