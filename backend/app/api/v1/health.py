from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.deps import get_session

router = APIRouter(tags=["health"])


@router.get("/health")
async def healthcheck(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    database_ok = False
    redis_ok = False

    try:
        await session.execute(text("SELECT 1"))
        database_ok = True
    except Exception:
        database_ok = False

    redis = getattr(request.app.state, "redis", None)
    redis_configured = redis is not None
    if redis is not None:
        try:
            redis_ok = bool(await redis.ping())
        except Exception:
            redis_ok = False

    return {
        "status": "ok" if database_ok and (redis_ok or not redis_configured) else "degraded",
        "services": {
            "database": database_ok,
            "redis": redis_ok,
        },
    }

