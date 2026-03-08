from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class CategorySpendPoint(BaseModel):
    category_id: UUID | None = None
    category_name: str
    amount: Decimal
    color: str | None = None


class DailySpendPoint(BaseModel):
    date: str
    expense: Decimal
    income: Decimal


class AnalyticsOverviewResponse(BaseModel):
    month: str
    total_expense: Decimal
    total_income: Decimal
    balance: Decimal
    by_category: list[CategorySpendPoint]
    by_day: list[DailySpendPoint]
