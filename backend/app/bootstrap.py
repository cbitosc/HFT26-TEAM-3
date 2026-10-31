"""Portable, non-destructive database preparation: python -m app.bootstrap."""
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

BACKEND = Path(__file__).resolve().parents[1]


def prepare_database(settings=None):
    settings = settings or get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    try:
        if engine.dialect.name != 'postgresql':
            raise RuntimeError('TraceLine requires PostgreSQL. Set DATABASE_URL in the repository-root .env.')
        with engine.connect() as db:
            db.execute(text('SELECT 1'))
        cfg = Config(str(BACKEND / 'alembic.ini'))
        cfg.set_main_option('script_location', str(BACKEND / 'alembic'))
        # Use this exact settings object, including when invoked by a setup check or test.
        import argparse
        cfg.cmd_opts = argparse.Namespace(x=[f'url={settings.database_url}'])
        command.upgrade(cfg, 'head')
    finally:
        engine.dispose()


def main():
    try:
        prepare_database()
    except Exception as exc:
        # Never print a connection URL, password, SQL statement, or request parameters.
        print(f'Database preparation failed ({type(exc).__name__}).')
        print('Start PostgreSQL, create the database, and check DATABASE_URL in the repository-root .env.')
        print('The configured database user must be allowed to create/alter tables. Existing cases are not reset.')
        return 1
    print('Database ready. All migrations applied; existing cases preserved.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
