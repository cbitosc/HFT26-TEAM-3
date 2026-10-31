"""stored_path is content-addressed, so two cases that upload identical bytes share one stored file

Revision ID: 0003
Revises: 0002
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("evidence_files_stored_path_key", "evidence_files", type_="unique")
    op.create_index("ix_evidence_stored_path", "evidence_files", ["stored_path"])


def downgrade() -> None:
    op.drop_index("ix_evidence_stored_path", table_name="evidence_files")
    op.create_unique_constraint("evidence_files_stored_path_key", "evidence_files", ["stored_path"])
