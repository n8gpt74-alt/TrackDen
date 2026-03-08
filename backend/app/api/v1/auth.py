from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.deps import AuthPrincipal, authenticated_transaction, get_auth_principal, get_session
from app.db.models.category import Category
from app.schemas.auth import SessionResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/session", response_model=SessionResponse)
async def get_session_state(
    principal: AuthPrincipal = Depends(get_auth_principal),
    session: AsyncSession = Depends(get_session),
) -> SessionResponse:
    async with authenticated_transaction(session, principal) as user:
        result = await session.execute(
            select(Category).order_by(Category.is_system.desc(), Category.name.asc()),
        )
        categories = list(result.scalars().all())

        return SessionResponse(
            auth_source=principal.source,
            user=user,
            categories=categories,
        )

