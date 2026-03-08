from datetime import UTC, datetime


def month_bounds(month: str | None) -> tuple[datetime, datetime, str]:
    if month:
        start = datetime.strptime(month, "%Y-%m").replace(tzinfo=UTC)
    else:
        now = datetime.now(tz=UTC)
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)

    return start, end, start.strftime("%Y-%m")

