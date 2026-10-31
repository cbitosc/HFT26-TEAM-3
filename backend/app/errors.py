"""One error format for the whole API: {"error": {"code", "message", "details"}}."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        self.status, self.code, self.message, self.details = status, code, message, details or {}
        super().__init__(message)


def _body(code: str, message: str, details: dict | None = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DBAPIError)
    async def _database_error(_: Request, exc: DBAPIError) -> JSONResponse:
        status, code, message = database_error(exc)
        return JSONResponse(status_code=status, content=_body(code, message))

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content=_body(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [{"field": ".".join(str(p) for p in e["loc"]), "problem": e["msg"]} for e in exc.errors()]
        return JSONResponse(status_code=422, content=_body("VALIDATION_ERROR", "Request validation failed", {"fields": fields}))


def database_error(exc: DBAPIError) -> tuple[int, str, str]:
    state = getattr(exc.orig, 'sqlstate', None) or getattr(exc.orig, 'pgcode', None)
    constraint = getattr(getattr(exc.orig, 'diag', None), 'constraint_name', None)
    if state in {'42P01', '42703'} or constraint == 'cases_created_by_fkey':
        return 503, 'DATABASE_SCHEMA_OUTDATED', ('Database setup is incomplete. From the repository root run python setup-local.py, '
                                                'or run python -m app.bootstrap from backend using its virtual environment. No database reset is needed.')
    if state == '23505':
        return 409, 'DATABASE_CONFLICT', 'This record conflicts with an existing record. Refresh and try again.'
    if state and state.startswith('23'):
        return 409, 'DATABASE_CONSTRAINT', 'The database could not accept this record. Check that all migrations have been applied.'
    return 503, 'DATABASE_UNAVAILABLE', ('Cannot reach a ready PostgreSQL database. Start PostgreSQL and check DATABASE_URL in the repository-root .env, '
                                         'then run python setup-local.py.')
