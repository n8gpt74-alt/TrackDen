from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.db.models.transaction import TransactionSource, TransactionType
from app.schemas.category import CategoryRead


class TransactionCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    type: TransactionType = TransactionType.EXPENSE
    currency: str = Field(default="RUB", min_length=3, max_length=3)
    category_id: str | None = None
    description: str | None = Field(default=None, max_length=500)
    merchant: str | None = Field(default=None, max_length=255)
    occurred_at: datetime | None = None
    source: TransactionSource = TransactionSource.MANUAL
    receipt_id: str | None = None


class TransactionUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    type: TransactionType | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    category_id: str | None = None
    description: str | None = Field(default=None, max_length=500)
    merchant: str | None = Field(default=None, max_length=255)
    occurred_at: datetime | None = None
    source: TransactionSource | None = None
    receipt_id: str | None = None


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    amount: Decimal
    type: TransactionType
    currency: str
    description: str | None = None
    merchant: str | None = None
    occurred_at: datetime
    source: TransactionSource
    receipt_id: UUID | None = None
    ai_confidence: float | None = None
    category: CategoryRead | None = None
    created_at: datetime
    updated_at: datetime


class TransactionListResponse(BaseModel):
    items: list[TransactionRead]
    total: int
