import asyncio
import json
from datetime import UTC, datetime
from uuid import UUID

import structlog
from redis.asyncio import Redis
from sqlalchemy import select

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.security.deps import set_rls_user
from app.db.models.receipt import Receipt
from app.db.models.transaction import OCRProvider, ReceiptStatus
from app.db.session import AsyncSessionFactory
from app.services.providers import get_ocr_service
from app.workers.constants import RECEIPT_OCR_QUEUE

settings = get_settings()
configure_logging(settings.log_level)
logger = structlog.get_logger(__name__)
ocr_service = get_ocr_service(settings)


async def process_job(payload: dict[str, object]) -> None:
    receipt_id = UUID(str(payload["receipt_id"]))
    user_id = int(payload["user_id"])

    async with AsyncSessionFactory() as session:
        async with session.begin():
            await set_rls_user(session, user_id)
            result = await session.execute(select(Receipt).where(Receipt.id == receipt_id))
            receipt = result.scalar_one_or_none()
            if receipt is None:
                logger.warning("receipt_not_found_for_job", receipt_id=str(receipt_id), user_id=user_id)
                return

            try:
                ocr_result = await ocr_service.extract(
                    file_path=receipt.storage_path,
                    original_filename=receipt.original_filename,
                )
                receipt.status = ReceiptStatus.PROCESSED
                receipt.ocr_provider = OCRProvider(ocr_result.provider)
                receipt.extracted_total = ocr_result.total
                receipt.extracted_merchant = ocr_result.merchant
                receipt.ocr_raw = ocr_result.raw
                receipt.error = None
                receipt.processed_at = datetime.now(tz=UTC)
            except Exception as exc:
                receipt.status = ReceiptStatus.FAILED
                receipt.error = str(exc)
                receipt.processed_at = datetime.now(tz=UTC)
                logger.exception("receipt_processing_failed", receipt_id=str(receipt_id), error=str(exc))


async def run_worker() -> None:
    if not settings.redis_enabled:
        logger.warning("worker_redis_disabled")
        return

    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        while True:
            job = await redis.brpop(RECEIPT_OCR_QUEUE, timeout=5)
            if job is None:
                await asyncio.sleep(0.3)
                continue

            _, raw_payload = job
            payload = json.loads(raw_payload)
            await process_job(payload)
    finally:
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(run_worker())
