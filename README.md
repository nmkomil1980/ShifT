# ShiftFlow

SaaS для управления сменами сотрудников: веб-консоль для директора/менеджеров и
мобильное приложение для всех сотрудников. Один REST/WebSocket-бэкенд кормит оба
клиента.

```
ShifT/
├── shiftflow-mvp/   Бэкенд — Node.js, REST + WebSocket, SQLite/PostgreSQL
├── web-admin/       Веб-консоль — React 19 + Vite
└── mobile/          Мобильное приложение — Flutter
```

## Возможности
Смены и недельный/месячный календарь с drag-and-drop · сотрудники и роли (RBAC)
· заявки (отгул/доступность/обмен) · командный чат в реальном времени ·
аналитика · уведомления и Web Push · приглашения по email, сброс пароля и
подтверждение почты · экспорт CSV/PDF · подписки и биллинг · мониторинг Sentry ·
русский/английский интерфейс.

## Требования
- **Node.js 22+** — бэкенд и веб-консоль
- **Flutter 3.27+** — мобильное приложение (по желанию)
- **Docker** — для запуска всего стека одной командой (по желанию)

## Установка всех зависимостей одной командой

```bash
# Windows
setup.cmd

# macOS / Linux
./setup.sh
```

Скрипт ставит зависимости бэкенда и веб-консоли (`npm install`) и мобильного
приложения (`flutter pub get`). Либо вручную по проектам:

```bash
cd shiftflow-mvp && npm install
cd ../web-admin  && npm install
cd ../mobile     && flutter pub get
```

## Запуск в разработке
Три терминала:

```bash
# 1) Бэкенд (API + WebSocket)
cd shiftflow-mvp
CORS_ORIGINS="http://localhost:5173" node src/server.js      # http://127.0.0.1:3000

# 2) Веб-консоль
cd web-admin && npm run dev                                   # http://localhost:5173

# 3) Мобильное приложение (в браузере/эмуляторе)
cd mobile && flutter run --dart-define=API_BASE=http://127.0.0.1:3000
```

Демо-вход: `demo@shiftflow.local` / `Demo123!` (или зарегистрируйте компанию).

## Запуск всего стека в Docker
PostgreSQL + API + веб-консоль за reverse-proxy Caddy (авто-HTTPS):

```bash
cp .env.example .env
docker compose up --build          # http://localhost
```

Подробности — в [DEPLOY.md](DEPLOY.md). Модель безопасности — в
[SECURITY.md](SECURITY.md).

## Тесты
```bash
cd shiftflow-mvp && npm test        # бэкенд (node --test)
cd web-admin     && npm test        # веб (Vitest)
cd mobile        && flutter test    # мобайл
```

## Стек и библиотеки
| Проект | Библиотеки |
|---|---|
| **Бэкенд** | `pg`, `web-push`, `ws`, `nodemailer`, `pdfkit`, `@sentry/node` (+ встроенный `node:sqlite`) |
| **Веб** | `react`, `react-dom`, `react-router-dom`, `@sentry/browser`; dev: `vite`, `vitest`, `jsdom`, `@testing-library/react` |
| **Мобайл** | `http`, `shared_preferences`, `intl`, `web_socket_channel`, `sentry_flutter` |
