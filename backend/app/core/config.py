from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_CONFIG_FILE = Path(__file__).resolve()
_APP_DIR = _CONFIG_FILE.parent.parent  # backend/app
_BACKEND_DIR = _APP_DIR.parent  # backend
_ROOT_DIR = _BACKEND_DIR.parent  # Online_Shopping (repo root)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[str(_BACKEND_DIR / ".env"), str(_ROOT_DIR / ".env"), ".env"],
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
        hide_input_in_errors=True,
    )

    # Application
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    # Log every SQL statement (SQLAlchemy echo). Independent of DEBUG; off by
    # default because it floods the logs (Version 2.0 C4).
    SQL_ECHO: bool = False
    PROJECT_NAME: str = "BASKET Backend"
    API_V1_STR: str = "/api/v1"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    LOG_LEVEL: str = "INFO"

    # Security & Auth
    SECRET_KEY: SecretStr = SecretStr(
        "insecure-default-development-key-change-in-production"
    )
    JWT_SECRET_KEY: SecretStr = SecretStr(
        "insecure-jwt-secret-key-change-in-production-min-256-bit"
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"
    CSRF_SECRET_KEY: SecretStr = SecretStr(
        "insecure-csrf-secret-key-change-in-production"
    )
    ALLOWED_HOSTS: list[str] = ["*"]
    # Number of trusted reverse proxies in front of the API. X-Forwarded-For is
    # ignored unless this is > 0 (prevents rate-limit bypass via spoofed headers).
    TRUSTED_PROXY_COUNT: int = 0
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    CORS_ORIGIN_REGEX: str | None = None

    # Database (Aiven PostgreSQL)
    DATABASE_URL: str | None = None
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 15
    DATABASE_SSL_MODE: str = "require"

    # Commerce Delivery Policy (Configurable in Phase 2C)
    # NOTE: ₹49.00 standard fee and ₹499.00 free delivery threshold are provisional baseline
    # defaults for development and demonstration, NOT approved universal platform business policies.
    # Production systems should configure these via environment variables or per-retailer contracts.
    DEFAULT_DELIVERY_FEE_PAISE: int = 4900  # ₹49.00 (Provisional baseline)
    DEFAULT_FREE_DELIVERY_THRESHOLD_PAISE: int = 49900  # ₹499.00 (Provisional baseline)

    # Inventory Reservation Policy (Phase 2D)
    RESERVATION_TTL_MINUTES: int = 10  # 10-minute hold for active stock reservation

    # In-process background workers (outbox publisher, reservation expiry,
    # payment reconciliation). Disable when running dedicated worker processes.
    BACKGROUND_WORKERS_ENABLED: bool = True
    OUTBOX_PUBLISHER_ENABLED: bool = True
    # How outbox events reach their consumers (Version 2.0 C2):
    #   "kafka"  – publish to Kafka; consumers read from Kafka (multi-instance).
    #   "direct" – deliver in-process to the same consumer handlers (single
    #              instance, no broker). Kafka consumers are not started.
    # Never switched automatically.
    OUTBOX_DISPATCH: str = "kafka"
    RESERVATION_CLEANUP_INTERVAL_SECONDS: float = 60.0
    PAYMENT_RECONCILE_INTERVAL_SECONDS: float = 120.0
    PAYMENT_SLA_ESCALATION_INTERVAL_SECONDS: float = 300.0
    PHASE3_FAST_JOB_INTERVAL_SECONDS: float = 15.0
    PHASE3_SLOW_JOB_INTERVAL_SECONDS: float = 3600.0

    # Phase 3 marketplace policy defaults
    DEMAND_POOL_DEFAULT_THRESHOLD: int = (
        2  # unique customers before retailers see a pool
    )
    FRONTEND_BASE_URL: str = "http://localhost:3000"
    # Phase 3I OCR provider (unset = feature reports OCR_PROVIDER_UNAVAILABLE)
    OCR_PROVIDER: str | None = None
    OCR_PROVIDER_URL: str | None = None
    OCR_PROVIDER_API_KEY: SecretStr | None = None

    # Internal Service Security (Phase 2D - background worker crons, internal tasks)
    # Must be set via environment variable. No hardcoded default is permitted in production.
    INTERNAL_SERVICE_KEY: SecretStr | None = None

    # Razorpay Payment Gateway (Phase 2F Sandbox)
    RAZORPAY_KEY_ID: SecretStr | None = SecretStr("rzp_test_basket_mock_key_id")
    RAZORPAY_KEY_SECRET: SecretStr | None = SecretStr(
        "mock_secret_key_at_least_16_chars"
    )
    RAZORPAY_WEBHOOK_SECRET: SecretStr | None = SecretStr(
        "mock_webhook_secret_at_least_16_chars"
    )
    RAZORPAY_BASE_URL: str = "https://api.razorpay.com/v1"
    RAZORPAY_CONNECT_TIMEOUT_SECONDS: float = 5.0
    RAZORPAY_READ_TIMEOUT_SECONDS: float = 10.0

    # Kafka (Aiven Kafka)
    KAFKA_BOOTSTRAP_SERVERS: str | None = None
    KAFKA_SECURITY_PROTOCOL: str = "SSL"
    KAFKA_SSL_CA_LOCATION: str | None = None
    KAFKA_SSL_CERTIFICATE_LOCATION: str | None = None
    KAFKA_SSL_KEY_LOCATION: str | None = None
    KAFKA_SASL_MECHANISM: str = "SCRAM-SHA-256"
    KAFKA_SASL_USERNAME: str | None = None
    KAFKA_SASL_PASSWORD: SecretStr | None = None
    KAFKA_CLIENT_ID: str = "basket-backend"
    KAFKA_PRODUCER_ACKS: str = "all"
    KAFKA_PRODUCER_RETRIES: int = 5
    KAFKA_PRODUCER_TIMEOUT_SECONDS: float = 2.0

    # Outbox Publisher (Phase 3B)
    OUTBOX_POLL_INTERVAL_SECONDS: float = 1.0
    OUTBOX_BATCH_SIZE: int = 20
    OUTBOX_LEASE_SECONDS: float = 30.0
    OUTBOX_BATCH_WINDOW_SECONDS: float = 15.0
    OUTBOX_PER_EVENT_TIMEOUT_SECONDS: float = 2.0
    OUTBOX_MAX_RETRIES: int = 5

    # Kafka Consumer (Phase 3C)
    KAFKA_CONSUMER_MAX_POLL_RECORDS: int = 50
    KAFKA_CONSUMER_SESSION_TIMEOUT_MS: int = 30000
    KAFKA_CONSUMER_MAX_POLL_INTERVAL_MS: int = 300000
    KAFKA_CONSUMER_AUTO_OFFSET_RESET: str = "earliest"
    KAFKA_CONSUMER_MAX_RETRIES: int = 5
    KAFKA_DLQ_TOPIC: str = "basket.events.dead-letter"

    # Media storage. "local" stores validated uploads on disk under MEDIA_ROOT
    # and serves them at MEDIA_PUBLIC_BASE_URL (development / single node).
    # "none" disables uploads (the API answers 503 MEDIA_STORAGE_UNAVAILABLE).
    # Production needs object storage (S3-compatible) — not implemented yet.
    MEDIA_STORAGE: str = "local"
    MEDIA_ROOT: str = str(_BACKEND_DIR / "media")
    # Verification documents: stored outside the public media root and only
    # downloadable by admins through an authenticated endpoint.
    MEDIA_PRIVATE_ROOT: str = str(_BACKEND_DIR / "media_private")
    MEDIA_PUBLIC_BASE_URL: str = "http://localhost:8000/media"
    MEDIA_MAX_BYTES: int = 5 * 1024 * 1024

    # OpenSearch (Aiven OpenSearch)
    OPENSEARCH_URL: str | None = None
    OPENSEARCH_USERNAME: str | None = None
    OPENSEARCH_PASSWORD: SecretStr | None = None
    OPENSEARCH_INDEX_PREFIX: str = "basket"
    # Append the database identity (name + short hash of host:port/name) to the
    # index prefix so two databases can never share an index (Version 2.0 C2).
    OPENSEARCH_INDEX_PER_DATABASE: bool = True
    OPENSEARCH_VERIFY_CERTS: bool = True
    OPENSEARCH_TIMEOUT_SECONDS: float = 5.0
    OPENSEARCH_MAX_RETRIES: int = 3
    OPENSEARCH_CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = 5
    OPENSEARCH_CIRCUIT_BREAKER_RECOVERY_SECONDS: float = 30.0
    # Search uses PostgreSQL while the oldest unpublished outbox event is older
    # than this (the OpenSearch index would be stale).
    SEARCH_INDEX_MAX_LAG_SECONDS: int = 300

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, v: object) -> object:
        """Accept plain Postgres URLs from managed hosts (Render, Railway, Heroku).

        Hosting providers hand out ``postgres://`` or ``postgresql://`` URLs, which
        SQLAlchemy would route to the psycopg2 driver. The app runs on asyncpg, so
        rewrite the scheme. URLs that already name a driver are left untouched.
        """
        if isinstance(v, str):
            url = v.strip()
            for prefix in ("postgres://", "postgresql://"):
                if url.startswith(prefix):
                    return "postgresql+asyncpg://" + url[len(prefix) :]
            return url
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: object) -> list[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                import json

                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return [str(item) for item in v]
        return ["http://localhost:3000", "http://127.0.0.1:3000"]

    @field_validator(
        "RAZORPAY_KEY_ID",
        "RAZORPAY_KEY_SECRET",
        "RAZORPAY_WEBHOOK_SECRET",
        mode="after",
    )
    @classmethod
    def validate_razorpay_credentials(
        cls, v: SecretStr | None, info
    ) -> SecretStr | None:
        env = str(info.data.get("ENVIRONMENT", "development")).lower()
        if env == "production":
            field_name = info.field_name
            if not v or not v.get_secret_value() or not v.get_secret_value().strip():
                raise ValueError(f"{field_name} must be configured in production.")
            secret = v.get_secret_value().strip()

            if field_name == "RAZORPAY_KEY_ID":
                if secret.startswith("rzp_test_"):
                    raise ValueError(
                        "RAZORPAY_KEY_ID cannot use test credentials (rzp_test_) in production; live key (rzp_live_) is required."
                    )
                if not secret.startswith("rzp_live_"):
                    raise ValueError(
                        "RAZORPAY_KEY_ID must begin with 'rzp_live_' in production."
                    )

            secret_lower = secret.lower()
            known_mock_values = {
                "mock_secret_key_at_least_16_chars",
                "mock_webhook_secret_at_least_16_chars",
                "replace_with_your_key_secret_at_least_16_chars",
                "replace_with_your_webhook_secret_at_least_16_chars",
                "secret",
                "mock",
                "example",
                "placeholder",
                "changeme",
                "change-me",
            }
            if (
                secret in known_mock_values
                or "mock" in secret_lower
                or "replace" in secret_lower
                or "placeholder" in secret_lower
                or "example" in secret_lower
            ):
                raise ValueError(
                    f"{field_name} must be configured with genuine production credentials; mock or placeholder values are not permitted in production."
                )
            if (
                field_name in ("RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET")
                and len(secret) < 16
            ):
                raise ValueError(
                    f"{field_name} in production must have at least 16 characters."
                )
        return v

    @field_validator("INTERNAL_SERVICE_KEY", mode="after")
    @classmethod
    def validate_internal_service_key(
        cls, v: SecretStr | None, info
    ) -> SecretStr | None:
        env = info.data.get("ENVIRONMENT", "development")
        if env == "production":
            if not v or not v.get_secret_value():
                raise ValueError(
                    "INTERNAL_SERVICE_KEY must be configured in production."
                )
            secret = v.get_secret_value()
            weak_keys = {
                "insecure-internal-service-key-change-in-production",
                "internal-key",
                "secret",
                "admin",
                "password",
                "changeme",
                "dev-internal-service-key-min-32-chars-long-secret",
            }
            if secret in weak_keys or len(secret) < 32:
                raise ValueError(
                    "INTERNAL_SERVICE_KEY in production must be a secure, unpredictable key with at least 32 characters."
                )
        return v

    @field_validator("KAFKA_SECURITY_PROTOCOL", mode="after")
    @classmethod
    def validate_kafka_security_protocol(cls, v: str, info) -> str:
        protocol = v.upper().strip()
        valid_protocols = {"SSL", "SASL_SSL", "PLAINTEXT", "SASL_PLAINTEXT"}
        if protocol not in valid_protocols:
            raise ValueError(
                f"KAFKA_SECURITY_PROTOCOL must be one of {sorted(valid_protocols)}"
            )
        env = str(info.data.get("ENVIRONMENT", "development")).lower()
        if env == "production" and protocol in ("PLAINTEXT", "SASL_PLAINTEXT"):
            raise ValueError(
                f"KAFKA_SECURITY_PROTOCOL cannot be '{protocol}' in production; SSL or SASL_SSL is required."
            )
        return protocol

    @field_validator("OUTBOX_DISPATCH", mode="after")
    @classmethod
    def validate_outbox_dispatch(cls, value: str) -> str:
        mode = (value or "").strip().lower()
        if mode not in ("kafka", "direct"):
            raise ValueError("OUTBOX_DISPATCH must be 'kafka' or 'direct'")
        return mode

    @field_validator("KAFKA_PRODUCER_ACKS", mode="after")
    @classmethod
    def validate_kafka_producer_acks(cls, v: str, info) -> str:
        valid_acks = {"all", "-1", "0", "1"}
        v_str = str(v).lower().strip()
        if v_str not in valid_acks:
            raise ValueError(f"KAFKA_PRODUCER_ACKS must be one of {sorted(valid_acks)}")
        env = str(info.data.get("ENVIRONMENT", "development")).lower()
        if env == "production" and v_str not in ("all", "-1"):
            raise ValueError(
                "KAFKA_PRODUCER_ACKS must be 'all' (or '-1') in production; acks=0 and acks=1 are prohibited."
            )
        return v_str

    @field_validator("KAFKA_SASL_PASSWORD", mode="after")
    @classmethod
    def validate_kafka_sasl_credentials(
        cls, v: SecretStr | None, info
    ) -> SecretStr | None:
        env = str(info.data.get("ENVIRONMENT", "development")).lower()
        protocol = str(info.data.get("KAFKA_SECURITY_PROTOCOL", "SSL")).upper()
        servers = info.data.get("KAFKA_BOOTSTRAP_SERVERS")
        if (
            env == "production"
            and servers
            and protocol in ("SASL_SSL", "SASL_PLAINTEXT")
        ):
            if not v or not v.get_secret_value() or not v.get_secret_value().strip():
                raise ValueError(
                    "KAFKA_SASL_PASSWORD must be configured in production when using SASL."
                )
            secret = v.get_secret_value().strip().lower()
            if "mock" in secret or "example" in secret or "placeholder" in secret:
                raise ValueError(
                    "KAFKA_SASL_PASSWORD cannot be a placeholder or mock value in production."
                )
        return v

    @field_validator("KAFKA_BOOTSTRAP_SERVERS", mode="before")
    @classmethod
    def clean_kafka_bootstrap_servers(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return str(v)

    @field_validator("KAFKA_BOOTSTRAP_SERVERS", mode="after")
    @classmethod
    def validate_kafka_bootstrap_servers(cls, v: str | None, info) -> str | None:
        if v is None:
            return None
        env = str(info.data.get("ENVIRONMENT", "development")).lower()
        if env == "production":
            cleaned_lower = v.lower()
            if (
                "mock" in cleaned_lower
                or "example" in cleaned_lower
                or "localhost" in cleaned_lower
                or "127.0.0.1" in cleaned_lower
            ):
                raise ValueError(
                    "KAFKA_BOOTSTRAP_SERVERS in production cannot use mock or localhost addresses."
                )
        return v

    @field_validator("OUTBOX_BATCH_SIZE", mode="after")
    @classmethod
    def validate_outbox_batch_size(cls, v: int) -> int:
        if v < 1 or v > 20:
            raise ValueError("OUTBOX_BATCH_SIZE must be between 1 and 20.")
        return v

    @field_validator("KAFKA_SSL_CA_LOCATION", mode="after")
    @classmethod
    def resolve_kafka_ssl_ca_location(cls, v: str | None) -> str | None:
        if not v or not v.strip():
            return None
        ca_str = v.strip()
        p = Path(ca_str)
        if p.is_file():
            return str(p.resolve())
        # Try relative to repo root
        repo_p = _ROOT_DIR / ca_str
        if repo_p.is_file():
            return str(repo_p.resolve())
        # Strip potential repo root directory duplicate prefix (e.g. Online_Shopping/...)
        if ca_str.startswith("Online_Shopping/"):
            sub_p = _ROOT_DIR / ca_str[len("Online_Shopping/") :]
            if sub_p.is_file():
                return str(sub_p.resolve())
        return ca_str

    @field_validator("OPENSEARCH_URL", mode="before")
    @classmethod
    def clean_opensearch_url(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return None
            # Strip embedded basic auth credentials if present (e.g. https://user:pass@host:port)
            if "@" in s:
                try:
                    from urllib.parse import urlparse, urlunparse

                    p = urlparse(s)
                    if p.username or p.password:
                        netloc = p.hostname or ""
                        if p.port:
                            netloc += f":{p.port}"
                        return urlunparse(
                            (p.scheme, netloc, p.path, p.params, p.query, p.fragment)
                        ).rstrip("/")
                except Exception:
                    pass
            return s.rstrip("/")
        return str(v)

    @field_validator("OPENSEARCH_URL", mode="after")
    @classmethod
    def validate_opensearch_url(cls, v: str | None, info) -> str | None:
        if not v:
            return None
        env = str(info.data.get("ENVIRONMENT", "development")).lower()
        if env == "production":
            if not v.startswith("https://"):
                raise ValueError("OPENSEARCH_URL must use https:// in production.")
            cleaned_lower = v.lower()
            if (
                "localhost" in cleaned_lower
                or "127.0.0.1" in cleaned_lower
                or "mock" in cleaned_lower
            ):
                raise ValueError(
                    "OPENSEARCH_URL in production cannot use mock or localhost addresses."
                )
        return v

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def cors_origin_regex(self) -> str | None:
        if self.CORS_ORIGIN_REGEX is not None:
            return self.CORS_ORIGIN_REGEX
        if not self.is_production:
            return (
                r"^https?://(localhost|127\.0\.0\.1|"
                r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
                r"192\.168\.\d{1,3}\.\d{1,3}|"
                r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|"
                r"[a-zA-Z0-9-]+\.trycloudflare\.com|"
                r"[a-zA-Z0-9-]+\.vercel\.app)(:\d+)?$"
            )
        return None

    @property
    def has_database(self) -> bool:
        return bool(self.DATABASE_URL and self.DATABASE_URL.strip())

    @property
    def has_kafka(self) -> bool:
        return bool(
            self.KAFKA_BOOTSTRAP_SERVERS and self.KAFKA_BOOTSTRAP_SERVERS.strip()
        )

    @property
    def has_opensearch(self) -> bool:
        return bool(self.OPENSEARCH_URL and self.OPENSEARCH_URL.strip())


settings = Settings()
