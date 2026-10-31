"""SQLAlchemy engine/session helpers and the declarative base."""
import uuid
from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def new_id(prefix: str):
    """Return a callable producing prefixed public IDs, e.g. new_id('case')() -> 'case_3f9a1c7d2b4e'."""
    return lambda: f"{prefix}_{uuid.uuid4().hex[:12]}"


@lru_cache
def get_engine(url: str | None = None) -> Engine:
    return create_engine(url or get_settings().database_url, pool_pre_ping=True, future=True)


def get_session_factory(url: str | None = None) -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(url), expire_on_commit=False, future=True)


def get_db() -> Iterator[Session]:
    """FastAPI dependency."""
    with get_session_factory()() as session:
        yield session
