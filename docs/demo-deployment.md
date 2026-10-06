# Размещение демо

[my-semester.app](https://my-semester.app/ui/login) работает на Northflank Sandbox
с PostgreSQL в Neon Free. DNS управляется через Name.com, служебные письма
отправляются через Resend. Домен отправителя подтверждён.

У демо отдельные базы. Локальные аккаунты, задачи, фотографии и письма
в него не переносятся. Для проверки используйте свою почту и тестовые данные.

## Компоненты

| Компонент | Размещение | Доступ |
| --- | --- | --- |
| FastAPI + React | Northflank, London | HTTPS; контейнер 8000 |
| Schedule API | Northflank, London | private HTTP, 5000 |
| MongoDB | addon Northflank, база `schedule` | private, TLS |
| PostgreSQL | Neon, Frankfurt | TLS |
| Почта | Resend, Ireland | SMTP, TLS |

Оба приложения собираются из ветки `master` репозитория
`is200406moil/schedule-service-backend`. Основное использует корневой Dockerfile,
расписание — `infra/schedule/Dockerfile`; build context — корень репозитория.
Build argument `SCHEDULE_COMMIT` задаёт коммит репозитория `rtu-mirea-schedule`,
из которого собирается парсер. Это версия исходников, её можно хранить в Git.

В Northflank у каждого приложения одна реплика. Команда запуска основного
контейнера применяет миграции Alembic, затем запускает FastAPI.
Docker Compose используется только локально.

## Основное приложение

В настройках сервиса добавьте следующие runtime-переменные:

| Переменная | Значение |
| --- | --- |
| `APP_ENVIRONMENT` | `production` |
| `COOKIE_SECURE` | `true` |
| `SECRET_KEY` | случайный секрет, не менее 32 байт |
| `DATABASE_URL` | Neon PostgreSQL URI, драйвер `postgresql+psycopg`, TLS |
| `PUBLIC_BASE_URL` | `https://my-semester.app` |
| `SCHEDULE_API_BASE_URL` | `http://schedule-api:5000/api/schedule` или фактический private host |
| `SCHEDULE_API_DOCS_URL` | ссылка на репозиторий парсера |
| `MAIL_MODE` | `smtp` |
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURITY` | `ssl` |
| `SMTP_USERNAME` | `resend` |
| `SMTP_PASSWORD` | Resend API key с правами отправки |
| `SMTP_SENDER` | `noreply@my-semester.app` |
| `PRIVACY_OPERATOR_NAME` / `PRIVACY_CONTACT_EMAIL` | актуальные контакты оператора |

Для миграций лучше использовать direct endpoint Neon. В строке подключения
замените только схему на `postgresql+psycopg`; сохраните экранирование
и SSL-параметры провайдера. После изменения переменных примените настройки
с перезапуском сервиса.

## Schedule API

| Переменная | Значение |
| --- | --- |
| `DEBUG` | `false` |
| `MONGODB_URL` | private URI addon с параметрами аутентификации и TLS |
| `SECRET_REFRESH_KEY` | отдельный случайный секрет |
| `MIN_CONNECTIONS_COUNT` | `0` |
| `MAX_CONNECTIONS_COUNT` | `10` |

В MongoDB используется база `schedule`. Пользователю подключения нужны права
на запись, создание индексов и атомарную замену коллекций. Парсер проверяет
весь набор данных перед публикацией; приложение читает сохранённое расписание.
Запросы обновления и формат статуса описаны в
[репозитории парсера](https://github.com/is200406moil/rtu-mirea-schedule).

## Домен и почта

В Northflank домен привязан к пути `/` основного сервиса на порту 8000.
На Name.com настроены TXT-подтверждение владения и ANAME корневого домена
на DNS target Northflank. TLS-сертификат обслуживает Northflank.

Добавьте DNS-записи из Resend: DKIM, записи отправки и DMARC.
Существующие записи сайта оставьте на месте. Отдельный почтовый ящик покупать
не нужно. Для служебных писем отслеживание открытий и переходов можно не включать.

При включённой почте войти можно только после подтверждения адреса.
Проверьте оба сценария: запросите письмо из формы, получите его и подтвердите
почту или смените пароль по ссылке. Одних настроек SMTP для этой проверки недостаточно.

## Проверка после развёртывания

- `/health` основного приложения проверяет процесс без обращения к PostgreSQL.
- `/ready` основного приложения проверяет PostgreSQL. Частые запросы к нему
  удерживают Neon активным; для постоянного мониторинга используйте `/health`.
- `/ready` Schedule API проверяет MongoDB, но не наполненность кэша.
- Проверьте, что приложение и API расписания возвращают группы и занятия.
- Зарегистрируйтесь, проверьте почтовые ссылки и задачи, откройте сайт на телефоне.
- Не сохраняйте секреты в Git, URL, скриншотах и журналах. Раскрытые секреты замените.

GitHub CI проверяет код, миграции и контейнеры. CI/CD Northflank собирает
и развёртывает приложения. После успешного деплоя всё равно проверьте вход,
календарь и задачи в браузере.

Что нужно определить для резервного копирования, сроков хранения и обработки
данных, перечислено в [заметке о подготовке запуска](privacy-deployment.md).

## Документация провайдеров

- [Northflank: Sandbox и тарифы](https://northflank.com/pricing)
- [Northflank: домены](https://northflank.com/docs/v1/application/domains/add-a-domain-to-your-account)
- [Northflank: приватное подключение к базе](https://northflank.com/docs/v1/application/databases-and-persistence/access-a-database)
- [Neon: подключение](https://neon.com/docs/connect/connect-from-any-app)
- [Resend: SMTP](https://resend.com/docs/send-with-smtp)

Демо использует бесплатные тарифы. Текущие лимиты смотрите в аккаунтах провайдеров.
