from app.services.ai.base import CategorizationResult, CategorizationService


class MockCategorizationService(CategorizationService):
    category_keywords: dict[str, tuple[str, ...]] = {
        "Продукты": ("еда", "food", "market", "магаз", "grocery", "продукт"),
        "Транспорт": ("taxi", "bus", "metro", "бенз", "transport", "такси", "метро"),
        "Кафе": ("coffee", "cafe", "restaurant", "кафе", "ресторан", "кофе"),
        "Дом": ("ikea", "rent", "home", "дом", "аренда", "квартира", "ремонт"),
        "Здоровье": ("pharmacy", "doctor", "health", "аптек", "врач"),
        "Развлечения": ("movie", "games", "cinema", "кино", "игр", "концерт"),
        "Подписки": ("subscription", "netflix", "spotify", "подпис", "saas"),
        "Зарплата": ("salary", "payroll", "зарплата", "bonus", "премия"),
    }

    async def categorize(self, *, text: str, category_names: list[str]) -> CategorizationResult:
        normalized = text.lower()
        available = set(category_names)

        for category_name, keywords in self.category_keywords.items():
            if category_name not in available:
                continue
            if any(keyword in normalized for keyword in keywords):
                return CategorizationResult(
                    provider="mock",
                    category_name=category_name,
                    confidence=0.92,
                    reason=f"Matched keywords for {category_name}.",
                )

        fallback = "Другое" if "Другое" in available else next(iter(category_names), None)
        return CategorizationResult(
            provider="mock",
            category_name=fallback,
            confidence=0.56 if fallback else 0.0,
            reason="Used fallback category because no keywords matched.",
        )

