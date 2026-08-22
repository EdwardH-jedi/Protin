from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "local"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    postgres_url: str = "postgresql://protin:protin@localhost:5432/protin"
    redis_url: str = "redis://localhost:6379/0"

    # Comma-separated networks whose direct peers may supply client-IP headers.
    # Never use a wildcard: forwarded headers are attacker-controlled unless the
    # immediate network peer is a trusted reverse proxy.
    trusted_proxy_cidrs: str = "127.0.0.1/32,::1/128"

    # Google Calendar OAuth 2.0
    # Register at https://console.cloud.google.com/ → APIs & Services → Credentials
    google_client_id: str = ""
    google_client_secret: str = ""
    # Must match an authorised redirect URI in Google Cloud Console
    google_redirect_uri: str = "http://localhost:8000/users/me/google-calendar/callback"

    # Expo Push Notifications
    # Leave empty to disable push delivery (staging default)
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"

    # Shared secret for internal-only endpoints such as notification processing.
    # Required in staging/production for routes mounted under /internal.
    internal_api_token: str = ""

    # Apple Sign-in. Must match the app's bundle identifier (iOS) or the
    # Services ID (web) registered with Apple Developer. Required when the
    # /auth/apple endpoint is enabled in staging/production.
    apple_client_id: str = ""

    # Apple Sign-in token revocation (App Store 5.1.1(v)). Required ONLY to
    # revoke a user's Apple tokens during account deletion. When any of the
    # three are empty the backend skips the code-exchange/revoke steps
    # entirely (local dev, CI, reviewer env), leaving email/password flows and
    # identity-token verification unaffected.
    #   * apple_team_id     — 10-char Apple Developer Team ID (client_secret iss)
    #   * apple_key_id      — 10-char Key ID of the Sign in with Apple .p8 key
    #   * apple_private_key — the .p8 private key PEM contents (ES256). Provided
    #                         via secret/env; literal "\n" escapes are accepted.
    apple_team_id: str = ""
    apple_key_id: str = ""
    apple_private_key: str = ""

    # JWT signing key — must be set in .env for staging/production.
    secret_key: str = "change-me-in-production"

    # Field-level encryption key for OAuth tokens stored in the database.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Required and validated as a Fernet key in staging/production; optional
    # only in local development (where the legacy plaintext sentinel remains).
    field_encryption_key: str = ""

    # Comma-separated allowed CORS origins. Empty = wildcard (local dev only).
    cors_origins: str = ""

    # Local/dev media storage. Profile photos are written to
    # ``{media_root}/profile_photos/{user_id}/{file}`` and exposed at
    # ``{media_url_prefix}/profile_photos/{user_id}/{file}`` via StaticFiles.
    # Cloud object storage (S3/GCS) is a future replacement.
    media_root: str = "media"
    media_url_prefix: str = "/media"
    media_max_file_bytes: int = 5 * 1024 * 1024
    media_max_total_bytes: int = 16 * 1024 * 1024
    media_max_dimension: int = 6000
    media_max_pixels: int = 20_000_000

    # Google Places API (New) — venue discovery provider.
    #
    # Used by app/services/places.py to back the "Google-Maps-like venue
    # density" picker results in v1.1. Empty string is the default and
    # the provider returns [] without making any HTTP call — so the
    # local seed catalog continues to work unchanged when the key is
    # not configured (local dev, CI, App Store reviewer environment).
    google_places_api_key: str = ""

    # V2 Tournaments feature flag.
    #
    # Why it's behind a flag:
    #   Tournaments are a V2 surface — list/join/leave is implemented but
    #   bracket generation, result verification, and rank integration are
    #   intentionally NOT. The flag lets V1 production hide the feature
    #   entirely so users don't see a half-finished surface on the App
    #   Store build.
    #
    # Default policy:
    #   * APP_ENV=local        → ON by default. V2 development on this
    #                            branch should "just work" — `make run`
    #                            and the mobile entry card appears.
    #                            Override with TOURNAMENTS_ENABLED=false
    #                            to exercise the disabled-flag path.
    #   * APP_ENV=staging      → OFF unless explicitly enabled. Flip to
    #                            true for QA dogfooding.
    #   * APP_ENV=production   → OFF. Keep V1 production clean. Do not
    #                            enable until tournaments has a green
    #                            full-suite review and product approval.
    #
    # Mechanism:
    #   The persisted field stays bool with a False default so explicit
    #   env-var overrides (TOURNAMENTS_ENABLED=true|false) work as
    #   expected. ``model_post_init`` flips the default to True ONLY when
    #   we're in APP_ENV=local AND the env var was not explicitly set,
    #   so production never gets accidental local-only behaviour.
    tournaments_enabled: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    def model_post_init(self, __context: object) -> None:
        # ``model_fields_set`` tracks fields whose values came from the
        # constructor or env vars rather than the class-level default.
        # If a developer set TOURNAMENTS_ENABLED in their env (true OR
        # false), respect it. Otherwise auto-flip to True in local dev so
        # the V2 Tournaments surface is reachable without extra setup.
        if self.app_env == "local" and "tournaments_enabled" not in self.model_fields_set:
            self.tournaments_enabled = True

    @property
    def cors_origins_list(self) -> list[str]:
        if not self.cors_origins.strip():
            return []
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def async_postgres_url(self) -> str:
        """Return a postgresql+asyncpg:// URL for use with SQLAlchemy asyncio."""
        url = self.postgres_url
        # Normalise legacy postgres:// scheme
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        if not url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
