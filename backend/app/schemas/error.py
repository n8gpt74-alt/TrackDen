from typing import Any

from pydantic import BaseModel


class ErrorPayload(BaseModel):
    code: str
    message: str
    details: Any | None = None
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorPayload

