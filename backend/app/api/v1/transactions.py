import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.helpers import month_bounds
from app.core.errors import ApiException
from app.core.security.deps import AuthPrincipal, authenticated_transaction, get_auth_principal, get_session
from app.db.models.category import Category
from app.db.models.receipt import Receipt
from app.db.models.transaction import AIProvider, Transaction, TransactionType
from app.schemas.category import CategoryRead
from app.schemas.transaction import TransactionCreate, TransactionListResponse, TransactionRead, TransactionUpdate
from app.services.providers import get_ai_service

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _parse_uuid(value: str, field_name: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise ApiException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="invalid_uuid",
            message=f"{field_name} has invalid UUID format.",
        ) from exc


async def _load_categories(session: AsyncSession) -> list[Category]:
    result = await session.execute(select(Category).order_by(Category.is_system.desc(), Category.name.asc()))
    return list(result.scalars().all())


async def _resolve_category(session: AsyncSession, category_id: str | None) -> Category | None:
    if not category_id:
        return None

    result = await session.execute(select(Category).where(Category.id == _parse_uuid(category_id, "category_id")))
    category = result.scalar_one_or_none()
    if category is None:
        raise ApiException(
            status_code=status.HTTP_404_NOT_FOUND,
            code="category_not_found",
            message="Category was not found.",
        )
    return category


async def _resolve_receipt(session: AsyncSession, receipt_id: str | None) -> Receipt | None:
    if not receipt_id:
        return None

    result = await session.execute(select(Receipt).where(Receipt.id == _parse_uuid(receipt_id, "receipt_id")))
    receipt = result.scalar_one_or_none()
    if receipt is None:
        raise ApiException(
            status_code=status.HTTP_404_NOT_FOUND,
            code="receipt_not_found",
            message="Receipt was not found.",
        )
    return receipt


async def _autodetect_category(
    session: AsyncSession,
    *,
    description: str | None,
    merchant: str | None,
) -> tuple[Category | None, float | None, AIProvider]:
    prompt = " ".join(part for part in [merchant, description] if part)
    categories = await _load_categories(session)
    if not prompt.strip() or not categories:
        return None, None, AIProvider.MOCK

    ai_result = await get_ai_service().categorize(
        text=prompt,
        category_names=[category.name for category in categories],
    )
    category = next((item for item in categories if item.name == ai_result.category_name), None)
    provider = AIProvider(ai_result.provider) if ai_result.provider in AIProvider._value2member_map_ else AIProvider.MOCK
    return category, ai_result.confidence, provider


async def _get_transaction_or_404(session: AsyncSession, transaction_id: str) -> Transaction:
    result = await session.execute(select(Transaction).where(Transaction.id == _parse_uuid(transaction_id, "transaction_id")))
    transaction = result.scalars().unique().one_or_none()
    if transaction is None:
        raise ApiException(
            status_code=status.HTTP_404_NOT_FOUND,
            code="transaction_not_found",
            message="Transaction was not found.",
        )
    return transaction


@router.get("/categories", response_model=list[CategoryRead])
async def list_categories(
    principal: AuthPrincipal = Depends(get_auth_principal),
    session: AsyncSession = Depends(get_session),
) -> list[Category]:
    async with authenticated_transaction(session, principal):
        return await _load_categories(session)


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    transaction_type: TransactionType | None = Query(default=None, alias="type"),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    principal: AuthPrincipal = Depends(get_auth_principal),
    session: AsyncSession = Depends(get_session),
) -> TransactionListResponse:
    async with authenticated_transaction(session, principal):
        start, end, _ = month_bounds(month)
        filters = [Transaction.occurred_at >= start, Transaction.occurred_at < end]
        if transaction_type is not None:
            filters.append(Transaction.type == transaction_type)

        total = await session.scalar(select(func.count()).select_from(Transaction).where(*filters))
        result = await session.execute(
            select(Transaction)
            .where(*filters)
            .order_by(Transaction.occurred_at.desc(), Transaction.created_at.desc())
            .offset(offset)
            .limit(limit),
        )

        return TransactionListResponse(
            items=list(result.scalars().unique().all()),
            total=int(total or 0),
        )


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    payload: TransactionCreate,
    principal: AuthPrincipal = Depends(get_auth_principal),
    session: AsyncSession = Depends(get_session),
) -> Transaction:
    async with authenticated_transaction(session, principal):
        category = await _resolve_category(session, payload.category_id)
        receipt = await _resolve_receipt(session, payload.receipt_id)
        ai_confidence: float | None = None
        ai_provider = AIProvider.MOCK

        if category is None:
            detected_category, ai_confidence, ai_provider = await _autodetect_category(
                session,
                description=payload.description,
                merchant=payload.merchant or (receipt.extracted_merchant if receipt else None),
            )
            category = detected_category

        transaction = Transaction(
            user_id=principal.payload.user.id,
            amount=payload.amount.quantize(Decimal("0.01")),
            type=payload.type,
            currency=payload.currency.upper(),
            category_id=category.id if category else None,
            description=payload.description,
            merchant=payload.merchant or (receipt.extracted_merchant if receipt else None),
            source=payload.source,
            receipt_id=receipt.id if receipt else None,
            ai_confidence=ai_confidence,
            ai_provider=ai_provider,
        )
        if payload.occurred_at is not None:
            transaction.occurred_at = payload.occurred_at
        session.add(transaction)
        await session.flush()
        await session.refresh(transaction)
        return await _get_transaction_or_404(session, str(transaction.id))


@router.get("/{transaction_id}", response_model=TransactionRead)
async def get_transaction(
    transaction_id: str,
    principal: AuthPrincipal = Depends(get_auth_principal),
    session: AsyncSession = Depends(get_session),
) -> Transaction:
    async with authenticated_transaction(session, principal):
        return await _get_transaction_or_404(session, transaction_id)


@router.patch("/{transaction_id}", response_model=TransactionRead)
async def update_transaction(
    transaction_id: str,
    payload: TransactionUpdate,
    principal: AuthPrincipal = Depends(get_auth_principal),
    session: AsyncSession = Depends(get_session),
) -> Transaction:
    async with authenticated_transaction(session, principal):
        transaction = await _get_transaction_or_404(session, transaction_id)
        updates = payload.model_dump(exclude_unset=True)

        if "category_id" in updates:
            category = await _resolve_category(session, updates["category_id"])
            transaction.category_id = category.id if category else None

        if "receipt_id" in updates:
            receipt = await _resolve_receipt(session, updates["receipt_id"])
            transaction.receipt_id = receipt.id if receipt else None

        if "occurred_at" in updates and updates["occurred_at"] is None:
            raise ApiException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                code="invalid_occurred_at",
                message="occurred_at cannot be null.",
            )

        for field in ("amount", "type", "currency", "description", "merchant", "occurred_at", "source"):
            if field not in updates:
                continue
            value = updates[field]
            if field == "amount" and value is not None:
                value = value.quantize(Decimal("0.01"))
            if field == "currency" and value is not None:
                value = value.upper()
            setattr(transaction, field, value)

        if transaction.category_id is None:
            category, ai_confidence, ai_provider = await _autodetect_category(
                session,
                description=transaction.description,
                merchant=transaction.merchant,
            )
            if category is not None:
                transaction.category_id = category.id
                transaction.ai_confidence = ai_confidence
                transaction.ai_provider = ai_provider

        await session.flush()
        await session.refresh(transaction)
        return await _get_transaction_or_404(session, transaction_id)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: str,
    principal: AuthPrincipal = Depends(get_auth_principal),
    session: AsyncSession = Depends(get_session),
) -> Response:
    async with authenticated_transaction(session, principal):
        transaction = await _get_transaction_or_404(session, transaction_id)
        await session.delete(transaction)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
