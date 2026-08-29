# Student Tasks API

Учебный веб-сервис для управления задачами и дедлайнами. Пользователь может зарегистрироваться, войти в систему и работать только со своими задачами через REST API или простой серверный интерфейс.

Проект сделан как курсовая работа по программной инженерии. Основной акцент — разделение HTTP-слоя, бизнес-логики и доступа к данным, миграции схемы БД и воспроизводимый запуск.

## Что реализовано

- регистрация и вход по email;
- JWT-аутентификация через Bearer-токен или `HttpOnly` cookie;
- создание, просмотр, изменение и удаление задач;
- дедлайны, предметы и статусы задач;
- изоляция данных: запросы к задачам всегда ограничены текущим пользователем;
- миграции PostgreSQL через Alembic;
- Swagger UI и небольшой интерфейс на Jinja2;
- healthcheck для контейнера приложения.

## Стек

- Python 3.12, FastAPI, Pydantic;
- SQLAlchemy 2, PostgreSQL, Alembic;
- JWT, Argon2;
- Jinja2;
- Docker Compose;
- Pytest, Ruff.

## Как устроен проект

```text
app/
├── routers/       # HTTP API и веб-маршруты
├── services/      # правила работы с задачами
├── repositories/  # запросы к базе данных
├── models/        # SQLAlchemy-модели
├── schemas/       # входные и выходные модели API
├── core/          # конфигурация, БД и аутентификация
├── templates/     # серверные HTML-шаблоны
└── static/
alembic/           # миграции PostgreSQL
tests/             # проверки API и изоляции данных
```

Подробности о границах слоёв и принятых решениях: [docs/architecture.md](docs/architecture.md).

## Запуск через Docker Compose

Нужен Docker с поддержкой `docker compose`.

```bash
docker compose up --build
```

После запуска:

- веб-интерфейс: <http://localhost:8000/ui>;
- Swagger UI: <http://localhost:8000/docs>;
- healthcheck: <http://localhost:8000/health>.

При старте приложение ждёт готовности PostgreSQL и применяет миграции Alembic. Данные БД сохраняются в Docker volume.

Остановить сервис:

```bash
docker compose down
```

Переменные из `.env` необязательны для локального запуска. Чтобы заменить тестовый JWT-секрет или время жизни токена, скопируйте `.env.example` в `.env` и задайте свои значения.

## Локальный запуск

```bash
python -m venv .venv
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

Для локального запуска PostgreSQL должен быть доступен по адресу из `DATABASE_URL`.

## Проверки

```bash
ruff check .
pytest
```

Тесты используют отдельную SQLite-базу в памяти и не требуют запущенного PostgreSQL.

## Ограничения

Это учебный, а не production-сервис. Сейчас в нём нет восстановления пароля, отзыва JWT, фоновых уведомлений и полноценной защиты HTML-форм от CSRF. Эти ограничения не мешают основным сценариям, но их нужно учитывать перед реальным развёртыванием.
