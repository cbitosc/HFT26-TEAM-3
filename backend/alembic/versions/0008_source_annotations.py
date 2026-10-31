"""editable source annotations beside immutable evidence files

Revision ID: 0008
Revises: 0007
"""
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE evidence_files DROP CONSTRAINT ck_evidence_kind")
    op.execute(
        "ALTER TABLE evidence_files ADD CONSTRAINT ck_evidence_kind CHECK "
        "(kind IN ('dashcam','cctv','other','witness_text','witness_pdf','sensor_csv','annotation','ground_truth'))"
    )
    op.execute(
        """
        CREATE TABLE source_annotations (
            evidence_id varchar(32) PRIMARY KEY REFERENCES evidence_files(id),
            display_name varchar(160),
            location_text text,
            recording_start timestamptz,
            recording_end timestamptz,
            timezone varchar(64),
            camera_role varchar(10),
            clock_offset_ms integer,
            clock_offset_reference_id varchar(32) REFERENCES evidence_files(id),
            clock_offset_basis varchar(40),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_src_camera_role CHECK (camera_role IS NULL OR camera_role IN ('cctv','dashcam','other')),
            CONSTRAINT ck_src_offset_basis CHECK (clock_offset_basis IS NULL OR clock_offset_basis = 'declared_by_investigator'),
            CONSTRAINT ck_src_offset_pair CHECK (
                (clock_offset_ms IS NULL AND clock_offset_reference_id IS NULL)
                OR (clock_offset_ms IS NOT NULL AND clock_offset_reference_id IS NOT NULL)
            ),
            CONSTRAINT ck_src_offset_distinct CHECK (clock_offset_reference_id IS NULL OR clock_offset_reference_id <> evidence_id)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS source_annotations")
    op.execute("DELETE FROM evidence_files WHERE kind = 'other'")
    op.execute("ALTER TABLE evidence_files DROP CONSTRAINT ck_evidence_kind")
    op.execute(
        "ALTER TABLE evidence_files ADD CONSTRAINT ck_evidence_kind CHECK "
        "(kind IN ('dashcam','cctv','witness_text','witness_pdf','sensor_csv','annotation','ground_truth'))"
    )
