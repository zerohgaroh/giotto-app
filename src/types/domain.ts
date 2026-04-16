export type ServiceTableStatus = "free" | "occupied" | "waiting" | "ordered" | "bill";
export type ServiceRequestType = "waiter" | "bill";
export type BillLineSource = "guest" | "waiter";

export type WaiterProfile = {
  id: string;
  name: string;
  login: string;
  password: string;
  active: boolean;
  tableIds: number[];
};

export type HallTable = {
  tableId: number;
  status: ServiceTableStatus;
  assignedWaiterId?: string;
  guestStartedAt: number;
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

export type HallData = {
  waiters: WaiterProfile[];
  tables: HallTable[];
  requests: ServiceRequest[];
  billLines: BillLine[];
  notesByTable: Record<string, string>;
  floorPlan: {
    tables: Array<{ tableId: number; label?: string; x: number; y: number; shape: "square" | "round" | "rect" }>;
    zones: Array<{ id: string; label: string; x: number; y: number; width: number; height: number }>;
  };
  settings: { managerSoundEnabled: boolean };
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

export type WaiterTablesResponse = {
  waiter: WaiterProfile;
  tables: Array<HallTable & { activeRequest?: ServiceRequest }>;
};

export type WaiterTableDetailResponse = {
  waiter: WaiterProfile;
  table: HallTable;
  requests: ServiceRequest[];
  billLines: BillLine[];
  total: number;
  note: string;
  doneCooldownRemainingSec: number;
  reviewPrompt?: {
    tableId: number;
    waiterId?: string;
    createdAt: number;
    expiresAt: number;
  };
};
