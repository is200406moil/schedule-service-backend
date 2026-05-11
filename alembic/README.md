# Миграции Alembic

`env.py` подставляет `sqlalchemy.url` из `Settings` (переменная окружения `DATABASE_URL` / `.env`) и использует `Base.metadata` из `app.core.database`. После добавления моделей в `app.models` импортируйте их в `app.models` (или в `env.py`), чтобы метаданные видели таблицы, затем `alembic revision --autogenerate`.
