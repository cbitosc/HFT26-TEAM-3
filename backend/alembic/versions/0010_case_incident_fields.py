"""nullable case incident time and location text

Revision ID: 0010
Revises: 0009

Existing rows keep every current column. The new columns are null until an
investigator sets them. Downgrade drops only those two columns.
"""
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS incident_at timestamptz")
    op.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS location_text text")


def downgrade() -> None:
    op.execute("ALTER TABLE cases DROP COLUMN IF EXISTS location_text")
    op.execute("ALTER TABLE cases DROP COLUMN IF EXISTS incident_at")
