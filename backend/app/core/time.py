from datetime import UTC, date, datetime, timedelta, timezone

MOSCOW_TIMEZONE = timezone(timedelta(hours=3))


def normalize_due_at(value: datetime | None) -> datetime | None:
    """Store deadlines as UTC; naive input from the web form means Moscow time."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=MOSCOW_TIMEZONE)
    return value.astimezone(UTC)


def as_utc(value: datetime) -> datetime:
    """Restore UTC for drivers such as SQLite that return a naive datetime."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def as_moscow(value: datetime) -> datetime:
    return as_utc(value).astimezone(MOSCOW_TIMEZONE)


def moscow_date(value: datetime | None) -> date | None:
    return as_moscow(value).date() if value is not None else None


def datetime_local_value(value: datetime | None) -> str:
    return as_moscow(value).strftime("%Y-%m-%dT%H:%M") if value is not None else ""
