# Безопасность ShiftFlow

Сводка встроенных мер защиты и модели угроз.

## Аутентификация и сессии
- Пароли хранятся как PBKDF2-SHA256 (210k итераций, соль); сравнение
  постоянное по времени.
- Сессии — непрозрачные случайные токены (32 байта), в БД хранится только их
  SHA-256-хеш. Работают и cookie (`HttpOnly`, `SameSite=Lax`, `Secure` в
  production), и `Authorization: Bearer` (для мобайла).
- Абсолютный TTL (`SESSION_DAYS`) + опциональный idle-таймаут
  (`SESSION_IDLE_HOURS`); просроченные сессии подчищаются при входе.
- `POST /api/auth/logout-all` отзывает все сессии; сброс пароля отзывает
  остальные сессии.
- Rate-limiting на `login/register/forgot/reset/accept-invite`
  (`AUTH_RATE_LIMIT`, `AUTH_RATE_WINDOW_MIN`), ответ 429 + `Retry-After`.

## Авторизация (RBAC)
- Роли `owner` / `manager` / `employee`; все бизнес-запросы ограничены
  `organization_id` (multi-tenant изоляция).
- Owner-only: биллинг и назначение ролей manager/owner. Менеджер не может
  повышать роли, редактировать не-сотрудников или выдать подписку через
  `settings` (ключ `billing` игнорируется при merge).
- Контакты сотрудников (email/телефон) и массовый экспорт доступны только
  менеджерам/владельцу.

## Ввод и вывод
- Все SQL-запросы параметризованы (слой `db.js`), без интерполяции ввода.
- Токены приглашения/сброса/подтверждения — одноразовые, с TTL, хранится хеш.
- CSV-экспорт нейтрализует formula-injection (ведущие `= + - @` экранируются).
- HTML-письма экранируют пользовательские значения.
- React экранирует вывод; `dangerouslySetInnerHTML` не используется.

## Сеть и заголовки
- CORS: явные origin получают credentials; wildcard `*` — только анонимно
  (никогда произвольный origin + credentials).
- Web Push: адрес подписки валидируется (только `https`, публичный хост) —
  защита от SSRF во внутреннюю сеть.
- Caddy добавляет `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Content-Security-Policy`; наружу открыт только веб-прокси,
  API и БД — во внутренней сети.
- В production включайте HTTPS (Caddy делает это автоматически при указании
  домена в `SITE_ADDRESS`).

## Что настроить перед боем
- Сменить `POSTGRES_PASSWORD`, задать `VAPID_*`, указать домен в `SITE_ADDRESS`.
- Настроить SMTP (`SMTP_*`) для реальной отправки писем.
- При необходимости — включить `SESSION_IDLE_HOURS` и подключить `SENTRY_DSN`.
