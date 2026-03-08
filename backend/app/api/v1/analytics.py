from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.helpers import month_bounds
from app.core.security.deps import AuthPrincipal, authenticated_transaction, get_auth_principal, get_session
from app.db.models.category import Category
from app.db.models.transaction import Transaction, TransactionType
from app.schemas.analytics import AnalyticsOverviewResponse, CategorySpendPoint, DailySpendPoint

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def get_overview(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    principal: AuthPrincipal = Depends(get_auth_principal),
    session: AsyncSession = Depends(get_session),
) -> AnalyticsOverviewResponse:
    async with authenticated_transaction(session, principal):
        start, end, month_label = month_bounds(month)
        filters = [Transaction.occurred_at >= start, Transaction.occurred_at < end]

        expense_case = case((Transaction.type == TransactionType.EXPENSE, Transaction.amount), else_=0)
        income_case = case((Transaction.type == TransactionType.INCOME, Transaction.amount), else_=0)

        totals_row = (
            await session.execute(
                select(
                    func.coalesce(func.sum(expense_case), 0),
                    func.coalesce(func.sum(income_case), 0),
                ).where(*filters),
            )
        ).one()

        category_rows = (
            await session.execute(
                select(
                    Category.id,
                    Category.name,
                    Category.color,
                    func.coalesce(func.sum(Transaction.amount), 0).label("amount"),
                )
                .join(Category, Transaction.category_id == Category.id, isouter=True)
                .where(*filters, Transaction.type == TransactionType.EXPENSE)
                .group_by(Category.id, Category.name, Category.color)
                .order_by(func.coalesce(func.sum(Transaction.amount), 0).desc()),
            )
        ).all()

        day_bucket = func.date(Transaction.occurred_at)
        daily_rows = (
            await session.execute(
                select(
                    day_bucket.label("day"),
                    func.coalesce(func.sum(expense_case), 0).label("expense"),
                    func.coalesce(func.sum(income_case), 0).label("income"),
                )
                .where(*filters)
                .group_by(day_bucket)
                .order_by(day_bucket.asc()),
            )
        ).all()

        total_expense = Decimal(str(totals_row[0]))
        total_income = Decimal(str(totals_row[1]))

        return AnalyticsOverviewResponse(
            month=month_label,
            total_expense=total_expense,
            total_income=total_income,
            balance=total_income - total_expense,
            by_category=[
                CategorySpendPoint(
                    category_id=str(row.id) if row.id else None,
                    category_name=row.name or "Без категории",
                    amount=Decimal(str(row.amount)),
                    color=row.color,
                )
                for row in category_rows
            ],
            by_day=[
                DailySpendPoint(
                    date=row.day.isoformat(),
                    expense=Decimal(str(row.expense)),
                    income=Decimal(str(row.income)),
                )
                for row in daily_rows
            ],
        )

