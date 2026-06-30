# ShiftFlow — мобильное приложение

Flutter-приложение для всех сотрудников (и менеджеров на ходу): главный экран
со сменами и активностью команды, календарь, команда, профиль и центр заявок
(доступность, замена смены, отгул). Собрано по Stitch-макетам и работает поверх
REST API из `../shiftflow-mvp` через Bearer-токен.

## Стек

- **Flutter 3.27** / Dart 3.6
- `http` — REST-клиент, `shared_preferences` — хранение токена, `intl` —
  форматирование дат (русская локаль)
- Состояние авторизации — `ChangeNotifier` + `InheritedNotifier` (без сторонних
  пакетов state-management)

## Запуск

Сначала бэкенд (из соседней папки):

```bash
cd ../shiftflow-mvp
node src/server.js
```

Затем приложение. Адрес API передаётся через `--dart-define`:

```bash
flutter pub get

# Android-эмулятор (хост виден как 10.0.2.2):
flutter run --dart-define=API_BASE=http://10.0.2.2:3000

# iOS-симулятор / desktop:
flutter run --dart-define=API_BASE=http://127.0.0.1:3000

# Web (для бэкенда задайте CORS_ORIGINS под адрес страницы):
flutter run -d chrome --dart-define=API_BASE=http://127.0.0.1:3000
```

Демо-вход: `demo@shiftflow.local` / `Demo123!`.

## Сборка

```bash
flutter build apk --dart-define=API_BASE=https://api.example.com
flutter build ios --dart-define=API_BASE=https://api.example.com
flutter build web --dart-define=API_BASE=https://api.example.com
```

## Структура

```
lib/
  main.dart              точка входа, инициализация локали и авторизации
  theme.dart             палитра и тема из макетов
  api/                   ApiClient (Bearer) и AuthController (InheritedNotifier)
  models/                User, Shift, StaffMember, LeaveRequest
  widgets/               Avatar, StatusBadge и общие элементы
  screens/               login, home_shell + вкладки, requests_screen
```

> Экран командного чата из макетов пока заменён списком команды — для чата
> нужен отдельный backend (сообщения/диалоги), это следующий этап.
