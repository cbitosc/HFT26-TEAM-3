"""decided_by / created_by / reviewer / author / uploaded_by are actor names (X-Actor header), not foreign keys to a users table

Revision ID: 0007
Revises: 0006
"""
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

COLS = [("actor_links", "decided_by"), ("investigation_findings", "reviewer"), ("reconstruction_scenarios", "created_by"),
        ("annotations", "author"), ("cases", "created_by"), ("evidence_files", "uploaded_by")]


def upgrade() -> None:
    for table, col in COLS:
        op.drop_constraint(f"{table}_{col}_fkey", table, type_="foreignkey")
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {col} TYPE varchar(64)")


def downgrade() -> None:
    # Foreign keys are not restored: the columns now hold actor names, which are not user ids. Earlier downgrades drop the tables anyway.
    pass
