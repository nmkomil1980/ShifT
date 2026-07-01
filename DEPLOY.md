# Развёртывание ShiftFlow

Весь стек — PostgreSQL, REST API и веб-консоль за reverse-proxy **Caddy** —
поднимается одной командой через Docker Compose.

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Caddy (web) │─/api→│  API (node)  │─────▶│  PostgreSQL  │
│  :80 / :443  │      │   :3000      │      │   :5432      │
│  статика SPA │      │ (внутренний) │      │ (внутренний) │
└──────────────┘      └──────────────┘      └──────────────┘
```

Наружу торчит только `web` (Caddy): статику админки он отдаёт сам, а запросы
`/api/*` проксирует на бэкенд. API и БД в хост-порты не публикуются.

## Быстрый старт (локально)

```bash
cp .env.example .env      # при желании поменяйте пароли/порты
docker compose up --build
```

Откройте **http://localhost**. Демо-вход: `demo@shiftflow.local` / `Demo123!`
(создаётся автоматически при первом старте с пустой БД).

## Продакшен с автоматическим HTTPS

Caddy сам получит и продлит сертификат Let's Encrypt — нужен домен, указывающий
на сервер, и открытые порты 80/443:

```bash
# .env
SITE_ADDRESS=shiftflow.example.com
POSTGRES_PASSWORD=<надёжный-пароль>
VAPID_PUBLIC_KEY=<...>      # node -e "console.log(require('web-push').generateVAPIDKeys())"
VAPID_PRIVATE_KEY=<...>
```

```bash
docker compose up --build -d
```

После этого приложение доступно по `https://shiftflow.example.com`, а Web Push
работает по-настоящему (браузерная подписка требует HTTPS).

## Переменные окружения

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | учётка и имя БД | `shiftflow` |
| `SITE_ADDRESS` | адрес Caddy: `:80`, `localhost` или домен | `:80` |
| `HTTP_PORT` / `HTTPS_PORT` | публикуемые порты | `80` / `443` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | ключи Web Push | генерируются |
| `SENTRY_DSN` | мониторинг ошибок бэкенда (пусто = выкл.) | — |
| `VITE_SENTRY_DSN` | мониторинг ошибок веб-консоли (build-arg) | — |

Мобильное приложение включает Sentry через
`flutter build --dart-define=SENTRY_DSN=...`.

`DATABASE_URL` для API собирается из `POSTGRES_*` автоматически.

## Данные и бэкапы

Тома Docker: `pgdata` (база), `api_data` (VAPID-ключи), `caddy_data`
(сертификаты). Резервная копия базы:

```bash
docker compose exec db pg_dump -U shiftflow shiftflow > backup.sql
# восстановление:
cat backup.sql | docker compose exec -T db psql -U shiftflow shiftflow
```

## Обновление

```bash
git pull
docker compose up --build -d      # схема/миграции применяются при старте API
```

## Мобильное приложение

`mobile/` — это клиент, а не сервис. Собирайте его отдельно, указав адрес API:

```bash
flutter build apk --dart-define=API_BASE=https://shiftflow.example.com
flutter build ios --dart-define=API_BASE=https://shiftflow.example.com
```
