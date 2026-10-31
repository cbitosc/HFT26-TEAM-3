"""integrity triggers: immutable originals, append-only audit log, witness spans, inference and source rules

Revision ID: 0002
Revises: 0001
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

UP = [
    # ---- evidence_files: originals are immutable; only status/validation may change; no deletes
    """
    CREATE FUNCTION tl_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'evidence_files rows cannot be deleted: original evidence is immutable' USING ERRCODE = '23514';
      END IF;
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.case_id IS DISTINCT FROM OLD.case_id OR NEW.kind IS DISTINCT FROM OLD.kind
         OR NEW.original_filename IS DISTINCT FROM OLD.original_filename OR NEW.stored_path IS DISTINCT FROM OLD.stored_path
         OR NEW.mime_type IS DISTINCT FROM OLD.mime_type OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
         OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
         OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at OR NEW.synthetic IS DISTINCT FROM OLD.synthetic
         OR NEW.provenance IS DISTINCT FROM OLD.provenance OR NEW.licence IS DISTINCT FROM OLD.licence THEN
        RAISE EXCEPTION 'evidence_files: only status and validation may be updated' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;
    """,
    "CREATE TRIGGER tl_evidence_guard BEFORE UPDATE OR DELETE ON evidence_files FOR EACH ROW EXECUTE FUNCTION tl_evidence_guard();",
    # ---- witness_statements: original text is never altered or removed
    """
    CREATE FUNCTION tl_statement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'witness_statements rows cannot be deleted' USING ERRCODE = '23514';
      END IF;
      IF NEW.text_original IS DISTINCT FROM OLD.text_original OR NEW.witness_id IS DISTINCT FROM OLD.witness_id
         OR NEW.evidence_id IS DISTINCT FROM OLD.evidence_id OR NEW.source IS DISTINCT FROM OLD.source
         OR NEW.synthetic IS DISTINCT FROM OLD.synthetic THEN
        RAISE EXCEPTION 'witness_statements: the original statement cannot be modified' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;
    """,
    "CREATE TRIGGER tl_statement_guard BEFORE UPDATE OR DELETE ON witness_statements FOR EACH ROW EXECUTE FUNCTION tl_statement_guard();",
    # ---- sensor_records: raw timestamp text and raw values are preserved
    """
    CREATE FUNCTION tl_sensor_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'sensor_records rows cannot be deleted: raw sensor data is preserved' USING ERRCODE = '23514';
      END IF;
      IF NEW.t_raw IS DISTINCT FROM OLD.t_raw OR NEW.values IS DISTINCT FROM OLD.values
         OR NEW.sensor_source_id IS DISTINCT FROM OLD.sensor_source_id OR NEW.row_no IS DISTINCT FROM OLD.row_no THEN
        RAISE EXCEPTION 'sensor_records: raw values and timestamps cannot be modified' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;
    """,
    "CREATE TRIGGER tl_sensor_guard BEFORE UPDATE OR DELETE ON sensor_records FOR EACH ROW EXECUTE FUNCTION tl_sensor_guard();",
    # ---- audit_log: append-only
    """
    CREATE FUNCTION tl_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = '23514';
    END $$;
    """,
    "CREATE TRIGGER tl_audit_guard BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION tl_audit_guard();",
    # ---- witness_claims: the quoted source_text must be the exact substring of the original statement
    """
    CREATE FUNCTION tl_claim_span() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE t text;
    BEGIN
      SELECT text_original INTO t FROM witness_statements WHERE id = NEW.statement_id;
      IF t IS NULL THEN
        RAISE EXCEPTION 'witness_claims: statement % not found', NEW.statement_id USING ERRCODE = '23514';
      END IF;
      IF NEW.char_end > length(t) THEN
        RAISE EXCEPTION 'witness_claims: span ends beyond the statement text' USING ERRCODE = '23514';
      END IF;
      IF substr(t, NEW.char_start + 1, NEW.char_end - NEW.char_start) IS DISTINCT FROM NEW.source_text THEN
        RAISE EXCEPTION 'witness_claims: source_text does not match the statement span' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;
    """,
    "CREATE TRIGGER tl_claim_span BEFORE INSERT OR UPDATE ON witness_claims FOR EACH ROW EXECUTE FUNCTION tl_claim_span();",
    # ---- events: inference premises must exist and must not be inferences; events are append-only (review_status may change)
    """
    CREATE FUNCTION tl_event_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE p text;
    BEGIN
      IF NEW.category = 'inference' THEN
        FOR p IN SELECT jsonb_array_elements_text(NEW.inference->'premises') LOOP
          IF NOT EXISTS (SELECT 1 FROM events WHERE id = p AND category <> 'inference') THEN
            RAISE EXCEPTION 'inference premise % does not exist or is itself an inference', p USING ERRCODE = '23514';
          END IF;
        END LOOP;
      END IF;
      RETURN NEW;
    END $$;
    """,
    "CREATE TRIGGER tl_event_insert_guard BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION tl_event_insert_guard();",
    """
    CREATE FUNCTION tl_event_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'events are append-only: create a new version with supersedes instead' USING ERRCODE = '23514';
      END IF;
      IF to_jsonb(NEW) - 'review_status' IS DISTINCT FROM to_jsonb(OLD) - 'review_status' THEN
        RAISE EXCEPTION 'events are append-only: only review_status may be updated' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;
    """,
    "CREATE TRIGGER tl_event_append_only BEFORE UPDATE OR DELETE ON events FOR EACH ROW EXECUTE FUNCTION tl_event_append_only();",
    # ---- events: every non-inference event must have at least one source reference by commit time
    """
    CREATE FUNCTION tl_event_requires_source() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.category <> 'inference' AND NOT EXISTS (SELECT 1 FROM event_sources WHERE event_id = NEW.id) THEN
        RAISE EXCEPTION 'event % has no source reference', NEW.id USING ERRCODE = '23514';
      END IF;
      RETURN NULL;
    END $$;
    """,
    """
    CREATE CONSTRAINT TRIGGER tl_event_requires_source AFTER INSERT ON events
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tl_event_requires_source();
    """,
]

DOWN = [
    "DROP TRIGGER IF EXISTS tl_event_requires_source ON events;",
    "DROP FUNCTION IF EXISTS tl_event_requires_source();",
    "DROP TRIGGER IF EXISTS tl_event_append_only ON events;",
    "DROP FUNCTION IF EXISTS tl_event_append_only();",
    "DROP TRIGGER IF EXISTS tl_event_insert_guard ON events;",
    "DROP FUNCTION IF EXISTS tl_event_insert_guard();",
    "DROP TRIGGER IF EXISTS tl_claim_span ON witness_claims;",
    "DROP FUNCTION IF EXISTS tl_claim_span();",
    "DROP TRIGGER IF EXISTS tl_audit_guard ON audit_log;",
    "DROP FUNCTION IF EXISTS tl_audit_guard();",
    "DROP TRIGGER IF EXISTS tl_sensor_guard ON sensor_records;",
    "DROP FUNCTION IF EXISTS tl_sensor_guard();",
    "DROP TRIGGER IF EXISTS tl_statement_guard ON witness_statements;",
    "DROP FUNCTION IF EXISTS tl_statement_guard();",
    "DROP TRIGGER IF EXISTS tl_evidence_guard ON evidence_files;",
    "DROP FUNCTION IF EXISTS tl_evidence_guard();",
]


def upgrade() -> None:
    for stmt in UP:
        op.execute(stmt)


def downgrade() -> None:
    for stmt in DOWN:
        op.execute(stmt)
