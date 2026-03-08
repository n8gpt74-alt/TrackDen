import hashlib
import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiException
from app.core.security.deps import AuthPrincipal, authenticated_transaction, get_auth_principal, get_session
from app.db.models.receipt import Receipt
from app.db.models.transaction import OCRProvider, ReceiptStatus
from app.schemas.receipt import ReceiptRead
from app.services.providers import get_ocr_service
from app.workers.constants import RECEIPT_OCR_QUEUE

router = APIRouter(prefix="/receipts", tags=["receipts"])


async def _process_receipt_inline(
    *,
    session: AsyncSession,
    principal: AuthPrincipal,
    receipt_id: uuid.UUID,
    storage_path: str,
    original_filename: str | None,
) -> Receipt:
    settings = get_settings()
    ocr_service = get_ocr_service(settings)

    async with authenticated_transaction(session, principal):
        result = await session.execute(select(Receipt).where(Receipt.id == receipt_id))
        receipt = result.scalar_one()

        try:
            ocr_result = await ocr_service.extract(file_path=storage_path, original_filename=original_filename)
            receipt.status = ReceiptStatus.PROCESSED
            receipt.ocr_provider = OCRProvider(ocr_result.provider)
            receipt.extracted_total = ocr_result.total
            receipt.extracted_merchant = ocr_result.merchant
            receipt.ocr_raw = ocr_result.raw
            receipt.error = None
        except Exception as exc:
            receipt.status = ReceiptStatus.FAILED
            receipt.error = str(exc)

        receipt.processed_at = datetime.now(tz=UTC)
        await session.flush()
        await session.refresh(receipt)
        return receipt


def _parse_receipt_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise ApiException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="invalid_uuid",
            message="receipt_id has invalid UUID format.",
        ) from exc


def _resolve_extension(filename: str | None, mime_type: str | None) -> str:
    if filename:
        suffix = Path(filename).suffix.lower()
        if suffix:
            return suffix[:10]

    mime_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    return mime_map.get(mime_type or "", ".img")


@router.post("", response_model=ReceiptRead, status_code=status.HTTP_202_ACCEPTED)
async def upload_receipt(
    request: Request,
    file: UploadFile = File(...),
    principal: AuthPrincipal = Depends(get_auth_principal),
    session: AsyncSession = Depends(get_session),
) -> Receipt:
    settings = get_settings()

    if not file.content_type or not file.content_type.startswith("image/"):
        raise ApiException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            code="unsupported_file_type",
            message="Only image uploads are allowed for receipt OCR.",
        )

    contents = await file.read()
    if not contents:
        raise ApiException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="empty_file",
            message="Uploaded file is empty.",
        )

    if len(contents) > settings.max_upload_bytes:
        raise ApiException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            code="file_too_large",
            message="Uploaded file exceeds the size limit.",
            details={"max_upload_bytes": settings.max_upload_bytes},
        )

    receipt_id = uuid.uuid4()
    extension = _resolve_extension(file.filename, file.content_type)
    user_dir = Path(settings.upload_dir) / str(principal.payload.user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    storage_path = user_dir / f"{receipt_id}{extension}"
    storage_path.write_bytes(contents)
    checksum = hashlib.sha256(contents).hexdigest()

    async with authenticated_transaction(session, principal):
        receipt = Receipt(
            id=receipt_id,
            user_id=principal.payload.user.id,
            storage_path=str(storage_path),
            original_filename=file.filename,
            mime_type=file.content_type,
            size_bytes=len(contents),
            sha256=checksum,
            ocr_provider=OCRProvider(settings.ocr_provider),
            status=ReceiptStatus.PENDING,
        )
        session.add(receipt)
        await session.flush()
        await session.refresh(receipt)

    redis = getattr(request.app.state, "redis", None)
    if redis is not None:
        try:
            await redis.lpush(
                RECEIPT_OCR_QUEUE,
                json.dumps({"receipt_id": str(receipt.id), "user_id": principal.payload.user.id}),
            )
            return receipt
        except Exception:
            pass

    return await _process_receipt_inline(
        session=session,
        principal=principal,
        receipt_id=receipt.id,
        storage_path=str(storage_path),
        original_filename=file.filename,
    )


@router.get("/{receipt_id}", response_model=ReceiptRead)
async def get_receipt(
    receipt_id: str,
    principal: AuthPrincipal = Depends(get_auth_principal),
    session: AsyncSession = Depends(get_session),
) -> Receipt:
    async with authenticated_transaction(session, principal):
        result = await session.execute(select(Receipt).where(Receipt.id == _parse_receipt_uuid(receipt_id)))
        receipt = result.scalar_one_or_none()
        if receipt is None:
            raise ApiException(
                status_code=status.HTTP_404_NOT_FOUND,
                code="receipt_not_found",
                message="Receipt was not found.",
            )
        return receipt
