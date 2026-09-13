import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    access_token_expires_in: str = "15m"
    refresh_token_expires_in: str = "30d"
    cors_origin: str = "*"
    google_books_api_key: str | None = None
    openai_api_key: str | None = None
    openai_vision_model: str = "gpt-4.1-mini"
    tesseract_cmd: str | None = None

    class Config:
        env_file = os.path.join(os.path.dirname(__file__), ".env")


settings = Settings()
