"""initial schema

Revision ID: 20260307_0001
Revises:
Create Date: 2026-03-07 00:01:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260307_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    transaction_type = postgresql.ENUM("expense", "income", name="transaction_type", create_type=False)
    transaction_source = postgresql.ENUM("manual", "ocr", name="transaction_source", create_type=False)
    receipt_status = postgresql.ENUM("pending", "processed", "failed", name="receipt_status", create_type=False)
    ocr_provider = postgresql.ENUM("mock", "google_vision", name="ocr_provider", create_type=False)
    ai_provider = postgresql.ENUM("mock", "openai", name="ai_provider", create_type=False)

    bind = op.get_bind()
    transaction_type.create(bind, checkfirst=True)
    transaction_source.create(bind, checkfirst=True)
    receipt_status.create(bind, checkfirst=True)
    ocr_provider.create(bind, checkfirst=True)
    ai_provider.create(bind, checkfirst=True)

    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("CREATE SCHEMA IF NOT EXISTS app")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION app.current_user_id()
        RETURNS bigint
        LANGUAGE sql
        STABLE
        AS $$
          SELECT NULLIF(current_setting('app.user_id', true), '')::bigint
        $$;
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION app.set_updated_at()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          NEW.updated_at := now();
          RETURN NEW;
        END;
        $$;
        """
    )

    op.create_table(
        "users",
        sa.Column("telegram_id", sa.BigInteger(), primary_key=True),
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column("first_name", sa.String(length=255), nullable=True),
        sa.Column("last_name", sa.String(length=255), nullable=True),
        sa.Column("photo_url", sa.String(length=1024), nullable=True),
        sa.Column("language_code", sa.String(length=16), nullable=True),
        sa.Column("is_premium", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("default_currency", sa.String(length=3), nullable=False, server_default=sa.text("'RUB'")),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default=sa.text("'UTC'")),
        sa.Column("last_auth_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id", ondelete="CASCADE"), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("icon", sa.String(length=32), nullable=True),
        sa.Column("color", sa.String(length=32), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "(is_system = true AND user_id IS NULL) OR (is_system = false AND user_id IS NOT NULL)",
            name="categories_system_consistency_chk",
        ),
    )

    op.create_table(
        "receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id", ondelete="CASCADE"), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("mime_type", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("ocr_provider", ocr_provider, nullable=False, server_default=sa.text("'mock'")),
        sa.Column("status", receipt_status, nullable=False, server_default=sa.text("'pending'")),
        sa.Column("ocr_raw", postgresql.JSONB(), nullable=True),
        sa.Column("extracted_total", sa.Numeric(12, 2), nullable=True),
        sa.Column("extracted_merchant", sa.String(length=255), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", transaction_type, nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default=sa.text("'RUB'")),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("merchant", sa.String(length=255), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("source", transaction_source, nullable=False, server_default=sa.text("'manual'")),
        sa.Column("receipt_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("receipts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ai_provider", ai_provider, nullable=False, server_default=sa.text("'mock'")),
        sa.Column("ai_confidence", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("amount >= 0", name="transactions_amount_chk"),
    )

    op.create_index(
        "categories_system_name_uq",
        "categories",
        [sa.text("lower(name)")],
        unique=True,
        postgresql_where=sa.text("is_system = true"),
    )
    op.create_index(
        "categories_user_name_uq",
        "categories",
        [sa.text("user_id"), sa.text("lower(name)")],
        unique=True,
        postgresql_where=sa.text("is_system = false"),
    )
    op.create_index("receipts_user_uploaded_at_idx", "receipts", ["user_id", "uploaded_at"])
    op.create_index("receipts_user_status_idx", "receipts", ["user_id", "status"])
    op.create_index("transactions_user_occurred_at_idx", "transactions", ["user_id", "occurred_at"])
    op.create_index("transactions_user_category_occurred_at_idx", "transactions", ["user_id", "category_id", "occurred_at"])
    op.execute(
        """
        INSERT INTO categories (name, icon, color, is_system)
        VALUES
          ('Продукты', 'cart', '#22c55e', true),
          ('Транспорт', 'car', '#3b82f6', true),
          ('Кафе', 'cup', '#f59e0b', true),
          ('Дом', 'house', '#8b5cf6', true),
          ('Здоровье', 'heart', '#ef4444', true),
          ('Развлечения', 'game', '#ec4899', true),
          ('Подписки', 'sparkles', '#06b6d4', true),
          ('Зарплата', 'wallet', '#10b981', true),
          ('Другое', 'tray', '#64748b', true);
        """
    )

    for table_name in ("users", "categories", "receipts", "transactions"):
        op.execute(f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY")

    op.execute(
        """
        CREATE TRIGGER trg_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

        CREATE TRIGGER trg_categories_updated_at
        BEFORE UPDATE ON categories
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

        CREATE TRIGGER trg_receipts_updated_at
        BEFORE UPDATE ON receipts
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

        CREATE TRIGGER trg_transactions_updated_at
        BEFORE UPDATE ON transactions
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
        """
    )

    op.execute(
        """
        CREATE POLICY users_self_select ON users
          FOR SELECT USING (telegram_id = app.current_user_id());
        CREATE POLICY users_self_update ON users
          FOR UPDATE USING (telegram_id = app.current_user_id())
          WITH CHECK (telegram_id = app.current_user_id());
        CREATE POLICY users_self_insert ON users
          FOR INSERT WITH CHECK (telegram_id = app.current_user_id());

        CREATE POLICY categories_select ON categories
          FOR SELECT USING (is_system = true OR user_id = app.current_user_id());
        CREATE POLICY categories_write ON categories
          FOR ALL USING (user_id = app.current_user_id())
          WITH CHECK (user_id = app.current_user_id() AND is_system = false);

        CREATE POLICY receipts_owner_all ON receipts
          FOR ALL USING (user_id = app.current_user_id())
          WITH CHECK (user_id = app.current_user_id());

        CREATE POLICY transactions_owner_all ON transactions
          FOR ALL USING (user_id = app.current_user_id())
          WITH CHECK (user_id = app.current_user_id());
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS transactions_owner_all ON transactions")
    op.execute("DROP POLICY IF EXISTS receipts_owner_all ON receipts")
    op.execute("DROP POLICY IF EXISTS categories_write ON categories")
    op.execute("DROP POLICY IF EXISTS categories_select ON categories")
    op.execute("DROP POLICY IF EXISTS users_self_insert ON users")
    op.execute("DROP POLICY IF EXISTS users_self_update ON users")
    op.execute("DROP POLICY IF EXISTS users_self_select ON users")

    op.execute("DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions")
    op.execute("DROP TRIGGER IF EXISTS trg_receipts_updated_at ON receipts")
    op.execute("DROP TRIGGER IF EXISTS trg_categories_updated_at ON categories")
    op.execute("DROP TRIGGER IF EXISTS trg_users_updated_at ON users")

    op.drop_index("transactions_user_category_occurred_at_idx", table_name="transactions")
    op.drop_index("transactions_user_occurred_at_idx", table_name="transactions")
    op.drop_index("receipts_user_status_idx", table_name="receipts")
    op.drop_index("receipts_user_uploaded_at_idx", table_name="receipts")
    op.drop_index("categories_user_name_uq", table_name="categories")
    op.drop_index("categories_system_name_uq", table_name="categories")

    op.drop_table("transactions")
    op.drop_table("receipts")
    op.drop_table("categories")
    op.drop_table("users")

    op.execute("DROP FUNCTION IF EXISTS app.set_updated_at()")
    op.execute("DROP FUNCTION IF EXISTS app.current_user_id()")
    op.execute("DROP SCHEMA IF EXISTS app")

    bind = op.get_bind()
    postgresql.ENUM(name="ai_provider").drop(bind, checkfirst=True)
    postgresql.ENUM(name="ocr_provider").drop(bind, checkfirst=True)
    postgresql.ENUM(name="receipt_status").drop(bind, checkfirst=True)
    postgresql.ENUM(name="transaction_source").drop(bind, checkfirst=True)
    postgresql.ENUM(name="transaction_type").drop(bind, checkfirst=True)


