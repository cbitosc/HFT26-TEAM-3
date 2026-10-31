"""Fresh-clone and outdated-schema regressions. Only TEST_DATABASE_URL is modified."""
from types import SimpleNamespace
from alembic import command
from sqlalchemy.exc import OperationalError, ProgrammingError
from app.bootstrap import prepare_database
from app.errors import database_error
from tests.conftest import _alembic_cfg


def test_empty_database_bootstrap_creates_cases_and_preserves_them_on_repeat(client, test_url):
    command.downgrade(_alembic_cfg(test_url), 'base')
    settings = client.settings.model_copy(update={'database_url': test_url})
    prepare_database(settings)
    response = client.post('/api/v1/cases', json={'title':'Fresh clone case','designation':'real','incident_at':'2026-10-31T12:00:00+05:30','location_text':'Hyderabad'})
    assert response.status_code == 201, response.text
    cid=response.json()['id']
    prepare_database(settings)
    assert client.get(f'/api/v1/cases/{cid}').status_code == 200
    health=client.get('/api/v1/health').json()['database']
    assert health['ok'] and health['migration']==health['required_migration']


def test_old_schema_reports_actionable_error_and_upgrade_restores_case_creation(client, test_url):
    cfg=_alembic_cfg(test_url)
    command.downgrade(cfg,'0009')
    try:
        health=client.get('/api/v1/health').json()['database']
        assert not health['ok'] and health['migration']=='0009'
        response=client.post('/api/v1/cases',json={'title':'Needs migration','designation':'real'})
        assert response.status_code==503, response.text
        assert response.json()['error']['code']=='DATABASE_SCHEMA_OUTDATED'
        assert 'setup-local.py' in response.json()['error']['message']
    finally:
        prepare_database(client.settings.model_copy(update={'database_url':test_url}))
    response=client.post('/api/v1/cases',json={'title':'After migration','designation':'real'})
    assert response.status_code==201, response.text


def test_database_errors_never_expose_credentials_or_sql():
    secret='postgresql://user:SECRET_PASSWORD@host/database'
    original=SimpleNamespace(sqlstate='42P01',diag=SimpleNamespace(constraint_name=None))
    error=ProgrammingError('INSERT PRIVATE STATEMENT',{'password':'SECRET_PASSWORD'},original)
    status,code,message=database_error(error)
    assert (status,code)==(503,'DATABASE_SCHEMA_OUTDATED')
    assert 'SECRET_PASSWORD' not in message and 'PRIVATE' not in message
    error=OperationalError(secret,None,Exception(secret))
    status,code,message=database_error(error)
    assert (status,code)==(503,'DATABASE_UNAVAILABLE')
    assert 'SECRET_PASSWORD' not in message
