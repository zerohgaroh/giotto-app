# Giotto Staff Mobile

`giotto-app` — продуктовый staff client для ролей `waiter` и `manager`.
Гостевой сайт и backend/BFF живут в соседнем проекте `giotto`.

## Product scope

### Waiter v1
- Логин через staff auth API.
- Список назначенных столов.
- Детальная карточка стола.
- `Acknowledge`, `Add order`, session note с autosave, `All service completed`.
- Foreground realtime через один app-level `GET /api/staff/realtime/stream` с cursor catch-up.
- Android waiter push через native FCM token и `expo-notifications`.

### Manager v1
- `Hall` как live monitor зала.
- Детальная карточка стола.
- `Reassign waiter` и `Close table`.
- История событий за последние 7 дней.
- Phone flow: `hall -> table detail`.
- Tablet flow: split-view `hall + detail`.

### Manager v2
- `Team`: waiter accounts, password reset, assignments.
- `Menu`: category CRUD, dish CRUD, availability toggle, reorder.
- `Layout`: zones, table inventory, archive/restore, floor coordinates.

## Architecture

- `giotto-app` хранит access token в памяти, refresh token в `SecureStore`, realtime cursor в `AsyncStorage`.
- `giotto` остаётся единственным backend для guest site и staff app.
- Staff web в `giotto` не считается продуктовым UI: `/manager*` и `/waiter*` остаются деприкейтнутыми.
- Realtime в foreground идёт через единый SSE provider, background-уведомления waiter идут через Expo Push.

## API surface used by the app

### Staff auth
- `POST /api/staff/auth/login`
- `POST /api/staff/auth/refresh`
- `POST /api/staff/auth/logout`
- `GET /api/staff/me`

### Waiter
- `GET /api/staff/waiter/tables`
- `GET /api/staff/waiter/tables/:tableId`
- `POST /api/staff/waiter/tables/:tableId/ack`
- `POST /api/staff/waiter/tables/:tableId/orders`
- `PATCH /api/staff/waiter/tables/:tableId/note`
- `POST /api/staff/waiter/tables/:tableId/done`
- `POST /api/staff/waiter/tables/:tableId/finish`

### Manager
- `GET /api/staff/manager/hall`
- `GET /api/staff/manager/tables/:tableId`
- `POST /api/staff/manager/tables/:tableId/reassign`
- `POST /api/staff/manager/tables/:tableId/close`
- `GET /api/staff/manager/history`
- `GET|POST|PATCH|PUT /api/staff/manager/waiters*`
- `GET|POST|PATCH|DELETE /api/staff/manager/menu*`
- `GET|PATCH|POST /api/staff/manager/layout` and `.../tables*`

### Realtime and devices
- `GET /api/staff/realtime/stream`
- `POST /api/staff/devices/push-token`

## Local setup

1. Скопируйте `.env.example` в `.env`.
2. Укажите адрес backend-проекта `giotto`.

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

### Real device note
- На телефоне `localhost` указывает на само устройство.
- Для локальной разработки обычно нужен IP машины, где поднят `giotto`.

Пример:

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:3000
```

Если в `.env` указан `localhost`, приложение попробует автоматически подставить Expo host IP, когда это возможно.

## Push notifications

Для Android push в Expo SDK 55 нужен dev build, а не Expo Go.
Android waiter-устройства регистрируют оба токена: native FCM (`platform: android`) и Expo (`platform: expo`) как fallback-канал.
`EXPO_PUBLIC_EAS_PROJECT_ID` обязателен для Expo Push path (iOS и Android fallback).

```bash
npm install -g eas-cli
npm run dev-build
```

## Run

```bash
npm install
npm run start
```

`npm run start` использует `--tunnel`, чтобы приложение стабильно открывалось на реальном телефоне даже если LAN/IP недоступны.
Если вы в одной Wi-Fi сети и хотите быстрее hot-reload, используйте:

```bash
npm run start:lan
```

Дополнительно:
- `npm test` — unit tests.
- `a` — Android.
- `i` — iOS.
- `w` — web preview.

## Phone launch troubleshooting

- Ошибка вида `exp://... request timed out` означает, что телефон не видит Metro server по LAN.
- Для стабильного запуска телефона используйте `npm run start:phone`:
  - команда гасит старые `expo/metro` процессы,
  - запускает новый Metro в tunnel режиме на 8081,
  - очищает кэш bundler.
- Проверяйте URL в терминале:
  - правильно для телефона: `exp://...exp.direct`
  - проблемный LAN-режим: `exp://172.x.x.x:8081` (как на вашем скриншоте).
- Для входа в приложение с телефона backend должен быть доступен с телефона: используйте публичный HTTPS URL или LAN IP backend-машины, но не `localhost`.

## Compatibility notes

- Waiter flow корректно теряет доступ к столу после manager `reassign` или `close`.
- Manager screens работают только через `api/staff/manager/*`, без legacy `hall/restaurant` product-flow.
- Guest-facing flows остаются на backend проекта `giotto`: waiter call, bill request, review, cart/menu snapshot.
