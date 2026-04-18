export type StaffRole = "waiter" | "manager";
export type ServiceTableStatus = "free" | "occupied" | "waiting" | "ordered" | "bill";
export type ServiceRequestType = "waiter" | "bill";
export type BillLineSource = "guest" | "waiter";
export type PushPlatform = "expo" | "ios" | "android" | "web";
export type FloorTableShape = "square" | "round" | "rect";
export type FloorTableSizePreset = "sm" | "md" | "lg";
export type ActivityActorRole = "guest" | "waiter" | "manager" | "system";
export type WaiterTaskType = "waiter_call" | "bill_request" | "follow_up";
export type WaiterTaskPriority = "urgent" | "normal";
export type WaiterTaskStatus = "open" | "acknowledged" | "in_progress" | "completed" | "cancelled";

export type WaiterProfile = {
  id: string;
  name: string;
  login: string;
  active: boolean;
  tableIds: number[];
};

export type ManagerProfile = {
  id: string;
  name: string;
  login: string;
  active: boolean;
};

export type HallTable = {
  tableId: number;
  status: ServiceTableStatus;
  assignedWaiterId?: string;
  guestStartedAt: number;
  hasActiveSession: boolean;
  doneCooldownUntil?: number;
};

export type ServiceRequest = {
  id: string;
  tableId: number;
  type: ServiceRequestType;
  reason: string;
  createdAt: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
  resolvedAt?: number;
};

export type BillLine = {
  id: string;
  tableId: number;
  dishId?: string;
  title: string;
  qty: number;
  price: number;
  source: BillLineSource;
  note?: string;
  createdAt: number;
};

export type ReviewPrompt = {
  id: string;
  tableId: number;
  waiterId?: string;
  createdAt: number;
  expiresAt: number;
};

export type GuestTableLink = {
  tableId: number;
  accessKey: string;
  shortPath: string;
  tablePath: string;
  menuPath: string;
  waiterPath: string;
  url: string;
};

export type MenuCategory = {
  id: string;
  labelRu: string;
  icon?: string;
};

export type Dish = {
  id: string;
  category: string;
  nameIt: string;
  nameRu: string;
  description: string;
  price: number;
  image: string;
  portion: string;
  energyKcal: number;
  badgeLabel?: string;
  badgeTone?: string;
  highlight?: boolean;
  available?: boolean;
};

export type RestaurantData = {
  profile: {
    name: string;
    subtitle: string;
    description: string;
    logo: string;
    banner: string;
    wifiName: string;
    wifiPassword: string;
  };
  categories: MenuCategory[];
  dishes: Dish[];
};

export type FloorZone = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FloorTableNode = {
  tableId: number;
  label?: string;
  zoneId?: string;
  x: number;
  y: number;
  shape: FloorTableShape;
  sizePreset: FloorTableSizePreset;
  archivedAt?: number;
};

export type HallData = {
  waiters: WaiterProfile[];
  managers: ManagerProfile[];
  tables: HallTable[];
  requests: ServiceRequest[];
  billLines: BillLine[];
  notesByTable: Record<string, string>;
  notesBySession: Record<string, string>;
  requestCooldowns: Record<string, Partial<Record<ServiceRequestType, number>>>;
  reviews: Array<{
    tableId: number;
    waiterId?: string;
    rating: number;
    comment?: string;
    createdAt: number;
  }>;
  reviewPrompts: Record<string, ReviewPrompt>;
  floorPlan: {
    tables: FloorTableNode[];
    zones: FloorZone[];
  };
  settings: { managerSoundEnabled: boolean };
};

export type WaiterTableSummary = HallTable & {
  activeRequest?: ServiceRequest;
  openTasksCount: number;
  urgentTasksCount: number;
};

export type WaiterTablesResponse = {
  waiter: WaiterProfile;
  tables: WaiterTableSummary[];
};

export type WaiterTask = {
  id: string;
  tableId: number;
  tableSessionId: string;
  waiterId?: string;
  type: WaiterTaskType;
  priority: WaiterTaskPriority;
  status: WaiterTaskStatus;
  sourceRequestId?: string;
  title: string;
  subtitle?: string;
  note?: string;
  createdAt: number;
  acknowledgedAt?: number;
  startedAt?: number;
  completedAt?: number;
  dueAt?: number;
};

export type WaiterQueueSummary = {
  urgentCount: number;
  inProgressCount: number;
  activeTablesCount: number;
};

export type WaiterQueueResponse = {
  waiter: WaiterProfile;
  summary: WaiterQueueSummary;
  tasks: WaiterTask[];
  tablesNeedingAttention: number[];
};

export type WaiterTableTimelineEntry = {
  id: string;
  type: string;
  ts: number;
  actorRole: ActivityActorRole;
  actorId?: string;
  payload?: Record<string, unknown>;
};

export type WaiterShortcutPresetItem = {
  dishId: string;
  qty: number;
};

export type WaiterQuickOrderPreset = {
  id: string;
  title: string;
  items: WaiterShortcutPresetItem[];
};

export type WaiterShortcuts = {
  favoriteDishIds: string[];
  noteTemplates: string[];
  quickOrderPresets: WaiterQuickOrderPreset[];
};

export type WaiterShiftSummary = {
  shiftStartedAt: number;
  tasksHandled: number;
  avgResponseSec: number;
  activeTablesCount: number;
  waiterOrdersCount: number;
  serviceCompletedCount: number;
};

export type WaiterTableDetailResponse = {
  waiter: WaiterProfile;
  table: HallTable;
  requests: ServiceRequest[];
  tasks: WaiterTask[];
  billLines: BillLine[];
  total: number;
  note: string;
  doneCooldownRemainingSec: number;
  reviewPrompt?: ReviewPrompt;
  timeline: WaiterTableTimelineEntry[];
};

export type ManagerTableSummary = HallTable & {
  activeRequestsCount: number;
  total: number;
  guestLink: GuestTableLink;
};

export type ManagerHallResponse = {
  manager: ManagerProfile;
  waiters: WaiterProfile[];
  tables: ManagerTableSummary[];
};

export type ManagerTableDetail = {
  table: HallTable;
  assignedWaiterId?: string;
  requests: ServiceRequest[];
  billLines: BillLine[];
  total: number;
  note: string;
  reviewPrompt?: ReviewPrompt;
  sessionId?: string;
  sessionStartedAt?: number;
  availableWaiters: WaiterProfile[];
  guestLink: GuestTableLink;
};

export type ManagerHistoryEntry = {
  id: string;
  type: string;
  tableId?: number;
  tableSessionId?: string;
  ts: number;
  actorRole: ActivityActorRole;
  actorId?: string;
  payload?: Record<string, unknown>;
};

export type ManagerHistoryPage = {
  items: ManagerHistoryEntry[];
  nextCursor?: string;
};

export type ManagerWaiterSummary = WaiterProfile & {
  assignedTablesCount: number;
};

export type ManagerWaiterDetail = ManagerWaiterSummary & {
  canDeactivate: boolean;
  activeSessionTableIds: number[];
};

export type ManagerMenuSnapshot = {
  categories: MenuCategory[];
  dishes: Dish[];
};

export type MenuImageUploadResponse = {
  url: string;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
};

export type MenuImageDraftState =
  | { mode: "empty" }
  | { mode: "local"; uri: string }
  | { mode: "uploading"; uri: string }
  | { mode: "uploaded"; uri: string; url: string; width?: number; height?: number }
  | { mode: "error"; uri: string; errorText: string };

export type ManagerLayoutSnapshot = {
  activeTables: FloorTableNode[];
  archivedTables: FloorTableNode[];
  zones: FloorZone[];
};

export type StaffUserPayload = {
  id: string;
  name: string;
  role: StaffRole;
};

export type StaffSession = {
  role: StaffRole;
  userId: string;
  name: string;
  sessionId: string;
  expiresAt: number;
};

export type StaffLoginResponse = {
  accessToken: string;
  refreshToken: string;
  role: StaffRole;
  user: StaffUserPayload;
  expiresAt: number;
};

export type StaffBootstrapResponse = {
  session: StaffSession;
  restaurant: RestaurantData;
};

export type RealtimeEvent = {
  id: string;
  type:
    | "waiter:called"
    | "bill:requested"
    | "waiter:acknowledged"
    | "waiter:done"
    | "order:added_by_waiter"
    | "review:submitted"
    | "table:status_changed"
    | "table:assignment_changed"
    | "menu:changed"
    | "table:created"
    | "table:archived"
    | "table:restored"
    | "floor:layout_changed"
    | "waiter:created"
    | "waiter:updated"
    | "waiter:deactivated"
    | "waiter:password_reset"
    | "task:created"
    | "task:updated"
    | "task:completed"
    | "shift:summary_changed";
  tableId?: number;
  ts: number;
  actor?: string;
  payload?: Record<string, unknown>;
};

export type PushDeviceRegistration = {
  token: string;
  platform: PushPlatform;
  appVersion?: string;
  deviceId?: string;
};
