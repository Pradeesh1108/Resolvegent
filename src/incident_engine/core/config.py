import os
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

class Config:
    GROQ_API_KEY = os.getenv("GROQ_API_KEY") or os.getenv("groq_api") or os.getenv("GROQ_API") or ""
    LLM_MODEL = os.getenv("LLM_MODEL", "qwen-2.5-32b")
    EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "lightweight").lower()
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./incidents.db")
    ALERT_ENGINE_URL = os.getenv("ALERT_ENGINE_URL", "http://localhost:8001")
    MAX_INVESTIGATION_STEPS = 4
    HIGH_RISK_ACTIONS = ["rollback_deployment", "restart_database", "modify_security_rules"]
    LOW_RISK_ACTIONS = ["clear_cache", "recycle_connection_pool", "scale_replicas"]

config = Config()
