from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    gemini_api_key: str
    allowed_origins: str = "http://localhost:5173"  # comma-separated; add your deployed frontend URL

    class Config:
        env_file = ".env"


settings = Settings()
