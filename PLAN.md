# Manager Delivery Status

Этот документ фиксирует текущее состояние поставки manager-функционала в `giotto-app` и `giotto`.

## Summary

- Поставка выполнена в два слоя: сначала operational foundation `manager v1`, затем admin suite `manager v2`.
- `giotto-app` является единственным продуктовым staff UI для `manager`.
- `giotto` остаётся guest site и backend/BFF для waiter и manager mobile flows.
- Staff web `/manager*` остаётся деприкейтнутым и не возвращается в продуктовый контур.

## Delivered

### Phase 1 — Backend foundation in `giotto`
- Добавлен manager-only namespace `api/staff/manager/*`.
- Введён `requireManagerSession`.
- Добавлен append-only лог `service_activity_events`.
- Реализованы:
  - `GET /api/staff/manager/hall`
  - `GET /api/staff/manager/tables/:tableId`
  - `POST /api/staff/manager/tables/:tableId/reassign`
  - `POST /api/staff/manager/tables/:tableId/close`
  - `GET /api/staff/manager/history`
- Staff SSE расширен поддержкой `table:assignment_changed`.
- Waiter compatibility сохранена: официант получает и теряет столы без relogin после reassignment/close.

### Phase 2 — Manager v1 mobile in `giotto-app`
- `ManagerPendingScreen` выведен из product-flow.
- Введён production navigator:
  - `Hall`
  - `History`
  - `ManagerTable`
- Реализованы phone и tablet сценарии.
- SSE используется как основной источник live-обновлений.
- Pull-to-refresh и connection/error banners оставлены как fallback и operational UX.
- Table detail ограничен manager-экшенами `reassign waiter` и `close table`.

### Phase 3 — v1 hardening and cutover
- Добавлены и обновлены тесты вокруг realtime/filtering и waiter access guards.
- README и этот `PLAN.md` приведены к текущему product-flow.
- `/manager*` в `giotto` не используется как рабочий staff UI.
- Автоматические проверки TypeScript и unit tests входят в финальную верификацию.

### Phase 4 — Backend admin suite for v2
- Table runtime перенесён в нормализованную модель `RestaurantTable` с `shape`, `floorX`, `floorY`, `archivedAt`.
- Добавлены manager endpoints для:
  - waiter admin
  - menu admin
  - layout/inventory admin
- `service_activity_events` расширен admin-событиями waiter/menu/layout уровня.

### Phase 5 — Manager v2 mobile in `giotto-app`
- Поверх `Hall` и `History` добавлены production tabs:
  - `Team`
  - `Menu`
  - `Layout`
- `Team` поддерживает create/edit/deactivate/reset password/assignment replace.
- `Menu` поддерживает category CRUD, dish CRUD, availability toggle и reorder.
- `Layout` поддерживает zones, table create, archive, restore и обновление floor coordinates.

## Current API inventory

### v1 manager APIs
- `GET /api/staff/manager/hall`
- `GET /api/staff/manager/tables/:tableId`
- `POST /api/staff/manager/tables/:tableId/reassign`
- `POST /api/staff/manager/tables/:tableId/close`
- `GET /api/staff/manager/history`

### v2 manager APIs
- `GET|POST /api/staff/manager/waiters`
- `GET|PATCH /api/staff/manager/waiters/:waiterId`
- `POST /api/staff/manager/waiters/:waiterId/reset-password`
- `PUT /api/staff/manager/waiters/:waiterId/assignments`
- `GET /api/staff/manager/menu`
- `POST /api/staff/manager/menu/categories`
- `PATCH|DELETE /api/staff/manager/menu/categories/:categoryId`
- `POST /api/staff/manager/menu/dishes`
- `PATCH|DELETE /api/staff/manager/menu/dishes/:dishId`
- `POST /api/staff/manager/menu/dishes/:dishId/toggle-availability`
- `PATCH /api/staff/manager/menu/reorder`
- `GET|PATCH /api/staff/manager/layout`
- `POST /api/staff/manager/tables`
- `POST /api/staff/manager/tables/:tableId/archive`
- `POST /api/staff/manager/tables/:tableId/restore`

## Acceptance status

### Gate A — manager v1
- Реализовано в коде: `done`.
- Требует локального ручного прогона e2e:
  - guest call -> waiter flow -> manager reassign/close -> history entry.
`
### Gate B — manager v2
- Реализовано в коде: `done`.
- Требует локального ручного прогона admin scenarios:
  - waiter account lifecycle
  - menu availability impact
  - table create/archive/restore
  - phone/tablet navigation sanity check

## Remaining manual verification

- Проверить полный e2e с живой БД и двумя staff-сессиями.
- Проверить Expo push delivery на реальном dev build.
- Проверить, что guest site корректно реагирует на `menu:changed` и waiter/bill flows в совместной среде.
