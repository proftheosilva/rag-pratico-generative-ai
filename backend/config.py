import os
from pathlib import Path
from dotenv import load_dotenv

# Carrega .env a partir da raiz do projeto
BASE_DIR = Path(__file__).resolve().parent.parent
env_path = BASE_DIR / ".env"
load_dotenv(dotenv_path=env_path)

class Settings:
    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY", "")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    # OpenRouter
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "openrouter/auto")
    OPENROUTER_BASE_URL: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.0"))

    # Backend & Embeddings
    BACKEND_HOST: str = os.getenv("BACKEND_HOST", "127.0.0.1")
    BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))
    EMBEDDING_MODEL_NAME: str = os.getenv("EMBEDDING_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
    TOP_K: int = int(os.getenv("TOP_K", "3"))

settings = Settings()
