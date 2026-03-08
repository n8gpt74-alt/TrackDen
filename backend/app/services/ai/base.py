from abc import ABC, abstractmethod

from pydantic import BaseModel


class CategorizationResult(BaseModel):
    provider: str
    category_name: str | None = None
    confidence: float = 0.0
    reason: str | None = None


class CategorizationService(ABC):
    @abstractmethod
    async def categorize(self, *, text: str, category_names: list[str]) -> CategorizationResult:
        raise NotImplementedError

