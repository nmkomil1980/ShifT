# ShiftFlow — веб-консоль администратора

React-приложение для владельца и менеджеров: панель управления, сотрудники,
календарь смен, аналитика и центр уведомлений. Интерфейс собран по
Stitch-макетам и работает поверх REST API из `../shiftflow-mvp`.

## Стек

- **React 19** + **React Router 7**
- **Vite 6** (dev-сервер и сборка)
- Без UI-фреймворка — собственная дизайн-система в `src/styles.css`
  (индиго-палитра, карточки, бейджи статусов из макетов)

## Запуск в разработке

Нужны два процесса. Сначала бэкенд (из соседней папки):

```bash
cd ../shiftflow-mvp
node src/server.js          # http://127.0.0.1:3000
```

Затем dev-сервер админки:

```bash
npm install
npm run dev                 # http://localhost:5173
```

Vite проксирует `/api` на бэкенд (см. `vite.config.js`), поэтому CORS в
разработке не нужен, а cookie-сессия работает на одном origin. Цель прокси
можно переопределить переменной `API_TARGET`.

Демо-вход: `demo@shiftflow.local` / `Demo123!`.

## Сборка

```bash
npm run build               # → dist/
npm run preview             # предпросмотр собранного билда
```

В продакшене статику из `dist/` можно отдавать любым веб-сервером, а API
вынести на отдельный origin — клиент хранит bearer-токен (`localStorage`) и
шлёт его в заголовке `Authorization`, поэтому третьесторонние cookie не нужны.

## Структура

```
src/
  lib/        api-клиент, контекст авторизации, утилиты форматирования
  components/ Layout (сайдбар + топбар), Modal, иконки
  pages/      Login, Dashboard, Staff, Calendar, Analytics, Notifications, Settings
```
