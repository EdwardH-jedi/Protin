from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all SQLAlchemy models.

    Import this class in every model module and inherit from it.
    Alembic's env.py imports Base.metadata for autogenerate support.
    """
