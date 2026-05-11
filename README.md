# Веб-сервис задач и дедлайнов (бэкенд)

Monorepo: приложение (`app/`) и отчёт (`report/`) логически разделены.

## Структура

- `app/` — FastAPI, Clean Architecture слои
- `alembic/` — миграции БД (`alembic upgrade head`)
- `report/` — LaTeX по ГОСТ 7.32 (шаблон подключается отдельно)

## Запуск приложения (после установки зависимостей)

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**PostgreSQL:** сервер должен быть запущен, в строке подключения — **реальные** имя БД, пользователь и пароль.

### Вариант A: Docker (если PostgreSQL «в докере», а не установлен в системе)

В корне репозитория есть `docker-compose.yml`: одной командой поднимаются:
- основной сайт (FastAPI) на `http://localhost:8000`
- сервис расписания RTU MIREA на `http://localhost:5000`
- PostgreSQL и MongoDB как зависимости

Параметры БД: пользователь `user`, пароль `password`, БД `student_tasks`, на хосте порт **15432** → контейнер **5432** (как в `.env.example`; на Windows часто уже заняты 5432/5433 системным PostgreSQL).

```bash
docker compose up -d
cd rtu-mirea-schedule
docker compose up -d
cd ..
```

С пересборкой образов (рекомендуется после изменений в коде):

```bash
docker compose up -d --build
```

Важно: контейнер `rtu-mirea-schedule` должен быть запущен. Проверка:

```bash
docker compose ps rtu-mirea-schedule
```

Если вы запускаете основной FastAPI локально (не в Docker), поднимите минимум сервис расписания и MongoDB:

```bash
docker compose up -d mongodb rtu-mirea-schedule
```

Дождитесь статуса `healthy` (`docker compose ps`). В **`.env`** можно оставить строку из **`.env.example`** без изменений (только для локальной разработки; в проде пароли меняйте).

Остановка: `docker compose down` (данные в volume `student_tasks_pgdata` сохраняются). Удалить данные: `docker compose down -v`.

После смены порта в `docker-compose.yml` выполните **`docker compose up -d`** ещё раз (пересоздаст проброс). В **`.env`** в `DATABASE_URL` должен быть **тот же порт**, что слева в `ports:` (сейчас **15432**).

### Вариант B: свой PostgreSQL

1. Скопируйте `.env.example` в **`.env`** и отредактируйте `DATABASE_URL`, например:  
   `postgresql+psycopg://логин:пароль@localhost:15432/student_tasks` (или ваш порт из `docker-compose.yml`)
2. Создайте БД и пользователя в PostgreSQL (если ещё нет), права на схему `public` — по вашей политике.
3. Примените миграции (после того как БД доступна):

```bash
alembic upgrade head
```

4. Запуск:

```bash
uvicorn app.main:app --reload
```

Если `alembic upgrade` падает с **connection refused** или **password authentication failed** — не запущен PostgreSQL или неверный `DATABASE_URL` в `.env`.

Минимальный интерфейс на Jinja2: **`/ui`** (вход и задачи). Тот же JWT можно передать в заголовке `Authorization: Bearer …` или получить в cookie после входа через форму.

## Проверка API (Swagger, Bearer, cookie) — шаг 1 после запуска

Один и тот же JWT читает зависимость `get_current_user`: сначала заголовок **`Authorization: Bearer`**, иначе cookie **`access_token`** (см. `app/core/deps.py`).

1. **Bearer в `/docs`:** выполните `POST /auth/login` с телом JSON `{"email":"…","password":"…"}`, скопируйте `access_token`, нажмите **Authorize**, введите `Bearer <токен>` (или только токен — зависит от версии UI). Затем `GET /auth/me` и `GET/POST/... /tasks` должны отвечать **200** для своего пользователя.
2. **Только cookie:** войдите через **`/ui`** в том же браузере и том же origin (`http://127.0.0.1:8000`). Запросы к API с этой же вкладки/сайта, которые отправляют cookie (например свой скрипт или `curl -b` с сохранённым `Set-Cookie`), получат **`GET /auth/me`** без заголовка `Authorization`.  
   **Важно:** встроенный **Try it out** в Swagger иногда **не прикрепляет** cookie к запросу; для надёжной проверки в UI используйте шаг 1 (Bearer). Проверка «только cookie» удобна через `curl`/Postman или отдельный минимальный HTML/скрипт на том же хосте.

Пример с `curl` (после `POST /auth/login` подставьте токен вручную):

```bash
curl -s http://127.0.0.1:8000/auth/me -H "Authorization: Bearer ВАШ_ТОКЕН"
```

Пример с cookie (подставьте значение cookie `access_token` после входа через `/ui`):

```bash
curl -s http://127.0.0.1:8000/auth/me -H "Cookie: access_token=ВАШ_ТОКЕН"
```

## Сборка PDF отчёта

В каталоге `report/` используйте свой способ сборки (например `latexmk` или скрипт из шаблона [latex-g7-32](https://github.com/latex-g7-32/latex-g7-32)). Артефакты сборки не коммитить (см. `.gitignore`).
