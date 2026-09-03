from datetime import UTC, date, datetime, timedelta

from app.core.time import MOSCOW_TIMEZONE, as_moscow, as_utc, moscow_date
from app.models import Task


def moscow_today() -> date:
    return datetime.now(MOSCOW_TIMEZONE).date()


def is_overdue(due_at: datetime | None) -> bool:
    if due_at is None:
        return False
    return as_utc(due_at) < datetime.now(UTC)


def due_label(due_at: datetime | None) -> str:
    if due_at is None:
        return "Без срока"
    due_at = as_moscow(due_at)
    today = moscow_today()
    if due_at.date() == today:
        return f"Сегодня · {due_at:%H:%M}"
    if due_at.date() == today + timedelta(days=1):
        return f"Завтра · {due_at:%H:%M}"
    months = (
        "января",
        "февраля",
        "марта",
        "апреля",
        "мая",
        "июня",
        "июля",
        "августа",
        "сентября",
        "октября",
        "ноября",
        "декабря",
    )
    return f"{due_at.day} {months[due_at.month - 1]} · {due_at:%H:%M}"


def _task_section_key(task: Task, today: date) -> str:
    if task.status == "done":
        return "done"
    if task.due_at is None:
        return "no_due"
    due_date = moscow_date(task.due_at)
    if due_date < today:
        return "overdue"
    if due_date == today:
        return "today"
    return "upcoming"


def task_sections(tasks: list[Task], today: date) -> list[dict[str, object]]:
    section_meta = (
        ("overdue", "Просрочено", "Срок уже прошёл"),
        ("today", "Сегодня", "На ближайшие часы"),
        ("upcoming", "Ближайшие", "Запланировано дальше"),
        ("no_due", "Без срока", "Можно сделать в свободное время"),
        ("done", "Выполнено", "Готовые задачи"),
    )
    grouped: dict[str, list[Task]] = {key: [] for key, _, _ in section_meta}
    for task in tasks:
        key = _task_section_key(task, today)
        grouped[key].append(task)

    for key in ("overdue", "today", "upcoming"):
        grouped[key].sort(key=lambda task: as_utc(task.due_at).timestamp() if task.due_at else 0)
    grouped["no_due"].sort(
        key=lambda task: task.created_at.timestamp(),
        reverse=True,
    )
    grouped["done"].sort(
        key=lambda task: task.updated_at.timestamp(),
        reverse=True,
    )
    return [
        {
            "key": key,
            "title": title,
            "subtitle": subtitle,
            "items": [
                {
                    "task": task,
                    "due_label": due_label(task.due_at),
                    "is_overdue": key == "overdue",
                    "is_done": task.status == "done",
                }
                for task in grouped[key]
            ],
        }
        for key, title, subtitle in section_meta
        if grouped[key]
    ]


def dashboard_date(value: date) -> str:
    weekdays = (
        "Понедельник",
        "Вторник",
        "Среда",
        "Четверг",
        "Пятница",
        "Суббота",
        "Воскресенье",
    )
    months = (
        "января",
        "февраля",
        "марта",
        "апреля",
        "мая",
        "июня",
        "июля",
        "августа",
        "сентября",
        "октября",
        "ноября",
        "декабря",
    )
    return f"{weekdays[value.weekday()]}, {value.day} {months[value.month - 1]}"
