"""Application settings.

Every option is read from environment variables (or a local ``.env`` file)
using one naming convention: ``SECTION__KEY``, e.g. ``AUTH__JWT_SECRET``.
See ``.env.example`` for the full reference.
"""

from __future__ import annotations

import os
from pathlib import Path

from pydantic import BaseModel, Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(
    os.environ.get("AERITH_PROJECT_ROOT") or Path(__file__).resolve().parents[2]
)


class DatabaseConfig(BaseModel):
    url: str = ""


class DatasetsConfig(BaseModel):
    db: DatabaseConfig = DatabaseConfig()
    max_per_chat: int = 10
    max_per_user: int = 10
    max_upload_mb: int = 512
    upload_tmp_dir: str = "/tmp/aerith-uploads"


class AuthConfig(BaseModel):
    access_ttl_minutes: int = 60
    cookie_name: str = "aerith_session"
    cookie_samesite: str = "lax"
    cookie_secure: bool = False
    data_key: str = ""  # Fernet key; empty -> derived from jwt_secret
    email_code_length: int = 6
    email_code_max_attempts: int = 5
    email_code_resend_cooldown_seconds: int = 60
    email_code_ttl_minutes: int = 10
    invite_ttl_hours: int = 72
    jwt_algorithm: str = "HS256"
    jwt_secret: str = "change-me-in-production"
    refresh_cookie_name: str = "aerith_refresh"
    refresh_ttl_days: int = 14
    seed_admin_display_name: str = "Administrator"
    seed_admin_login: str = "admin"
    seed_admin_password: str = "admin"


class LLMConfig(BaseModel):
    """Server-wide fallback provider (any OpenAI-compatible API).

    Optional: users can register their own providers in the UI instead.
    """

    api_key: str = ""
    base_url: str = ""
    default_model: str = ""


class MailConfig(BaseModel):
    from_email: str = "no-reply@localhost"
    from_name: str = "AERITH"
    host: str = ""
    password: str = ""
    port: int = 587
    use_ssl: bool = False
    use_tls: bool = True
    username: str = ""


class ChatConfig(BaseModel):
    default_system_prompt: str = ""
    default_temperature: float = 0.5
    web_search_context_size: str = "high"
    web_search_deep_read: bool = True
    auto_title_enabled: bool = True
    title_model: str = ""


class AnalyticsConfig(BaseModel):
    lead_model: str = ""
    planner_model: str = ""
    subagent_max_steps: int = 8
    subagent_timeout_sec: int = 120


class CorsConfig(BaseModel):
    allowed_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8888",
            "http://127.0.0.1:8888",
        ]
    )


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000
    public_url: str = ""  # used to build invite links


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", env_nested_delimiter="__"
    )

    analytics: AnalyticsConfig = AnalyticsConfig()
    auth: AuthConfig = AuthConfig()
    chat: ChatConfig = ChatConfig()
    cors: CorsConfig = CorsConfig()
    datasets: DatasetsConfig = DatasetsConfig()
    db: DatabaseConfig = DatabaseConfig()
    llm: LLMConfig = LLMConfig()
    mail: MailConfig = MailConfig()
    server: ServerConfig = ServerConfig()

    @computed_field
    @property
    def resolved_database_url(self) -> str:
        return self.db.url

    @computed_field
    @property
    def resolved_datasets_url(self) -> str:
        return self.datasets.db.url or self.db.url


settings = Settings()


def get_settings() -> Settings:
    return settings


def get_database_url() -> str:
    return settings.resolved_database_url


def get_datasets_database_url() -> str:
    return settings.resolved_datasets_url
