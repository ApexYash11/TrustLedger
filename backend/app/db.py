import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    if os.environ.get("POSTGRES_DB"):
        user = os.environ.get("POSTGRES_USER", "trustledger")
        password = os.environ.get("POSTGRES_PASSWORD", "")
        host = os.environ.get("POSTGRES_HOST", "localhost")
        port = os.environ.get("POSTGRES_PORT", "5432")
        name = os.environ["POSTGRES_DB"]
        return f"postgresql://{user}:{password}@{host}:{port}/{name}"
    return "sqlite:///./trustledger.db"


DATABASE_URL = _database_url()

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=True, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
