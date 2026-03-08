from app.services.ai.base import CategorizationResult, CategorizationService


class OpenAICategorizationService(CategorizationService):
    async def categorize(self, *, text: str, category_names: list[str]) -> CategorizationResult:
        raise RuntimeError("OpenAI categorization integration is not configured for this demo build.")
