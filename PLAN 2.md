# Manager v2: admin suite в `giotto-app` + production manager write-API в `giotto`

## Summary
- `manager v2` расширяет `manager v1` до полного admin-контура внутри `giotto-app`: `Hall`, `History`, `Team`, `Menu`, `Layout`.
- Scope этого этапа: управление waiter-аккаунтами и их столами, CRUD меню и стоп-листа, full table inventory с floor plan editor, мгновенное применение изменений без drafts/publish-step.
- `giotto` остаётся единственным backend/BFF; staff web `/manager*` не возвращается в продуктовый контур. Phone+tablet UX сохраняется как целевой режим, manager push по-прежнему не вводится.

## Key Changes
- В `giotto` добавить manager-only namespace `api/staff/manager/*` и общий `requireManagerSession`; все manager mutations идут только через bearer staff auth.
- Нормализовать floor/table storage для production editor:
  - `RestaurantTable` становится источником истины для `tableId`, `label`, `shape`, `floorX`, `floorY`, `archivedAt`.
  - `RestaurantSettings.floorPlan` сохраняет только layout-зоны и общие настройки зала.
  - миграция переносит координаты/shape из текущего JSON в `restaurant_tables`; `tableId` не переиспользуются.
- Добавить full waiter admin:
  - `GET /api/staff/manager/waiters`
  - `POST /api/staff/manager/waiters`
  - `PATCH /api/staff/manager/waiters/:waiterId`
  - `POST /api/staff/manager/waiters/:waiterId/reset-password`
  - `PUT /api/staff/manager/waiters/:waiterId/assignments`
  - менеджер создаёт waiter c `login+password`, меняет имя/логин/active, сбрасывает пароль и целиком заменяет набор назначенных столов.
  - деактивация waiter блокируется `409`, если у него есть активные назначения; сначала нужен reassignment.
- Добавить full menu admin:
  - `GET /api/staff/manager/menu`
  - `POST /api/staff/manager/menu/categories`
  - `PATCH /api/staff/manager/menu/categories/:categoryId`
  - `DELETE /api/staff/manager/menu/categories/:categoryId`
  - `POST /api/staff/manager/menu/dishes`
  - `PATCH /api/staff/manager/menu/dishes/:dishId`
  - `DELETE /api/staff/manager/menu/dishes/:dishId`
  - `POST /api/staff/manager/menu/dishes/:dishId/toggle-availability`
  - `PATCH /api/staff/manager/menu/reorder`
  - категории и блюда редактируются сразу; удаление категории разрешено только если в ней нет блюд; изображения остаются URL-строками, upload pipeline не добавляется.
- Добавить full floor/inventory admin:
  - `GET /api/staff/manager/layout`
  - `PATCH /api/staff/manager/layout`
  - `POST /api/staff/manager/tables`
  - `POST /api/staff/manager/tables/:tableId/archive`
  - `POST /api/staff/manager/tables/:tableId/restore`
  - новый стол получает `tableId = max(id) + 1`; архивирование заменяет удаление и сохраняет историю/ссылки на прошлые сессии.
  - архивирование запрещено, если у стола есть активная сессия или нерешённые запросы; restore возвращает тот же `tableId` и последние сохранённые label/shape/coordinates.
- Realtime и история расширяются под admin suite:
  - `service_activity_events` из `v1` получает admin types: `waiter:created`, `waiter:updated`, `waiter:deactivated`, `waiter:password_reset`, `table:assignment_changed`, `menu:changed`, `table:created`, `table:archived`, `table:restored`, `floor:layout_changed`.
  - `GET /api/staff/realtime/stream` публикует admin события staff-клиентам; `menu:changed` дополнительно идёт в guest-compatible stream, чтобы guest site и waiter add-order могли refetch menu snapshot.
- В `giotto-app` заменить legacy manager placeholders/старые polling-экраны на production navigator:
  - `Team` screen: список официантов, create/edit sheet, reset password, bulk assignment editor.
  - `Menu` screen: категории, блюда, reorder, inline stop-list, create/edit forms.
  - `Layout` screen: phone inspector + canvas, tablet split `canvas + side panel`, add/archive/restore tables, edit zones.
  - все manager mutations работают action-by-action с loading/error states; SSE является основным способом live invalidation, ручной refresh остаётся fallback.

## Public APIs / Types
- Добавить `ManagerWaiterSummary { id, name, login, active, tableIds, assignedTablesCount }` и `ManagerWaiterDetail { ...summary, canDeactivate, activeSessionTableIds }`.
- Mutation DTO для staff:
  - `CreateWaiterInput { name, login, password, tableIds }`
  - `UpdateWaiterInput { name?, login?, active? }`
  - `ResetWaiterPasswordInput { password }`
  - `ReplaceWaiterAssignmentsInput { tableIds }`
- Добавить `ManagerMenuSnapshot { categories, dishes }`, `MenuCategoryInput { labelRu, icon?, sortOrder? }`, `DishInput { categoryId, nameRu, nameIt, description, price, image, portion, energyKcal, badgeLabel?, badgeTone?, highlight?, available }`.
- Добавить `ManagerLayoutSnapshot { activeTables, archivedTables, zones }`, где `activeTables` и `archivedTables` используют `ManagerTableNode { tableId, label, shape, x, y, archivedAt? }`; `UpdateLayoutInput { tables, zones }` обновляет весь layout atomically.
- Расширить `RealtimeEventType` значениями `table:assignment_changed`, `menu:changed`, `table:created`, `table:archived`, `table:restored`, `floor:layout_changed`, `waiter:created`, `waiter:updated`, `waiter:deactivated`, `waiter:password_reset`.

## Test Plan
- Backend:
  - manager auth/403 guard на всех новых endpoints;
  - waiter create/update/reset/deactivate + уникальность `login`;
  - `PUT assignments` атомарно переносит столы между официантами и публикует `table:assignment_changed`;
  - menu category/dish CRUD, reorder и stop-list корректно меняют guest/waiter menu snapshot;
  - create/archive/restore table сохраняют стабильный `tableId`, не ломают историю и блокируют архивирование при активной сессии;
  - realtime и history фиксируют все admin events.
- Mobile:
  - manager tabs и формы на phone/tablet;
  - Team/Menu/Layout reducers и SSE invalidation;
  - guard’ы на 401/403/409;
  - optimistic UX только там, где действие можно безопасно откатить, без silent data loss.
- Manual e2e:
  - менеджер создаёт официанта -> назначает столы -> waiter логинится и видит новые столы;
  - менеджер переносит стол от одного официанта к другому -> обе waiter-сессии обновляются без relogin;
  - менеджер переводит блюдо в стоп-лист -> гость и waiter add-order получают обновлённое меню после realtime/refetch;
  - менеджер добавляет новый стол -> он появляется в layout и hall; архивированный стол исчезает из активного контура, но не теряет старую историю.

## Assumptions
- `manager v2` строится поверх уже внедрённого `manager v1`; Hall/History не переписываются концептуально, а дополняются admin-модулями.
- Конкурентные manager edits работают по модели `last write wins`; специальные `409` остаются только для рискованных конфликтов вроде deactivate waiter с назначениями, archive table с активной сессией и delete non-empty category.
- Restaurant profile/Wi-Fi/branding editing, media upload, manager push и advanced analytics остаются вне `v2`.
- Архивирование используется вместо удаления столов; hard delete для `RestaurantTable` не вводится.
