"""uncertain cross-camera associations, separate from tracker ids

Revision ID: 0009
Revises: 0008
"""
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE vehicle_associations (
            id varchar(32) PRIMARY KEY,
            case_id varchar(32) NOT NULL REFERENCES cases(id),
            scenario_id varchar(32) NOT NULL REFERENCES reconstruction_scenarios(id),
            status varchar(12) NOT NULL DEFAULT 'uncertain',
            tracks jsonb NOT NULL,
            supporting jsonb NOT NULL,
            contradicting jsonb NOT NULL,
            basis text NOT NULL,
            created_by varchar(64),
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_vas_status CHECK (status = 'uncertain'),
            CONSTRAINT ck_vas_tracks CHECK (jsonb_typeof(tracks) = 'array' AND jsonb_array_length(tracks) >= 2)
        )
        """
    )
    op.execute("CREATE INDEX ix_vas_scenario ON vehicle_associations (case_id, scenario_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS vehicle_associations")
