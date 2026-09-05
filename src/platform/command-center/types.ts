import type {
  BinaryHealthLevel,
  KitchenLoadLevel,
  PrintingHealthLevel,
  ServiceLoadLevel,
} from "@/platform/command-center/thresholds";
import type { ClassifiedStatus } from "@/platform/command-center/classify";

export type DurationStats = {
  average: number | null;
  p50: number | null;
  p95: number | null;
  worst: number | null;
  sampleCount: number;
};

export type TrendValue = {
  current: number;
  previous: number;
  percent: number | null;
};

export type RestaurantCommandRow = {
  tenantId: string;
  tenantName: string;
  tenantEnabled: boolean;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  restaurantEnabled: boolean;
  status: "active" | "quiet" | "disabled";
  needsAttention: boolean;
  attention: Array<{ subsystem: string; level: string; detail: string }>;
  period: {
    orders: number;
    servedOrders: number;
    openOrders: number;
    items: number;
    paymentCount: number;
    ordersPerHour: number;
    busiestHour: number | null;
    aovPaise: number | null;
  };
  current: {
    activeTables: number;
    activeStaff: number;
    kitchenBacklog: number;
    overdue: number;
    readyWaiting: number;
    pendingRequests: number;
    kitchenPaused: boolean;
    autoPauseThreshold: number;
    oldestOverdueMs: number | null;
  };
  revenue: {
    capturedGrossPaise: number;
    refundsPaise: number;
    netCapturedPaise: number;
    cashPaise: number;
    manualUpiPaise: number;
    automaticGatewayPaise: number;
    outstandingPaise: number;
    avgCapturedOrderPaise: number | null;
  };
  kitchen: {
    pending: number;
    preparing: number;
    ready: number;
    overdue: number;
    backlog: number;
    paused: boolean;
    autoPauseThreshold: number;
    oldestOverdueMs: number | null;
    sla: {
      servedEligible: number;
      onTime: number;
      missed: number;
      onTimePercent: number | null;
      avgMinutesLate: number | null;
      p50Late: number | null;
      p95Late: number | null;
      worstLateMinutes: number | null;
      avgPrepMinutes: number | null;
      label: string;
      neverMissed: boolean;
    };
    load: ClassifiedStatus<KitchenLoadLevel>;
  };
  service: {
    orderToServed: DurationStats;
    readyWaiting: number;
    tablesServed: number;
    ordersServed: number;
    guestAck: DurationStats;
    guestResolve: DurationStats;
    unresolvedRequests: number;
    oldestPendingMs: number | null;
    load: ClassifiedStatus<ServiceLoadLevel>;
    servers: Array<{
      userId: string;
      name: string;
      role: string;
      activeTables: number;
      readyWaiting: number;
      pendingRequests: number;
      avgAckMs: number | null;
      hasSession: boolean;
      load: ServiceLoadLevel;
      note: string | null;
    }>;
  };
  guest: {
    waiterCalls: number;
    billRequests: number;
    waterOrRefill: number;
    unresolved: number;
    acknowledged: number;
    avgAckMs: number | null;
    avgResolveMs: number | null;
    oldestPendingMs: number | null;
  };
  money: {
    capturedGrossPaise: number;
    refundsPaise: number;
    netCapturedPaise: number;
    outstandingPaise: number;
    pendingGatewayAttempts: number;
    failedGatewayAttempts: number;
    refundPending: number;
    refundFailures: number;
    reconciliationVariancePaise: number;
    cashVariancePaise: number;
    health: ClassifiedStatus<BinaryHealthLevel>;
  };
  printing: {
    jobs: number;
    acked: number;
    firstAttemptSuccess: number;
    retries: number;
    failures: number;
    ambiguous: number;
    reprints: number;
    queueDepth: number;
    lastSeenAt: string | null;
    lastSeenAgoMs: number | null;
    lastError: string | null;
    health: ClassifiedStatus<PrintingHealthLevel>;
  };
  reliability: {
    requestFailed: number;
    http5xx: number;
    uniqueFingerprints: number;
    jobFailures: number;
    providerFailures: number;
    printFailures: number;
    securityDenials: number;
    topErrors: Array<{
      fingerprint: string;
      count: number;
      latest: string;
      route: string | null;
      action: string | null;
      errorCode: string | null;
      restaurantId: string | null;
    }>;
    health: ClassifiedStatus<BinaryHealthLevel>;
  };
  security: {
    failedAuth: number;
    permissionDenied: number;
    crossRestaurant: number;
    invalidPrinterAuth: number;
    razorpaySignature: number;
    other: number;
    total: number;
  };
  staff: {
    activeSessions: number;
    ordersPlaced: number;
    itemsPrepared: number;
    itemsReady: number;
    itemsServed: number;
    ordersServed: number;
    tablesServed: number;
    paymentsCollected: number;
    revenueCollectedPaise: number;
    rows: Array<{
      userId: string;
      name: string;
      role: string;
      ordersPlaced: number;
      itemsPrepared: number;
      itemsReady: number;
      itemsServed: number;
      ordersServed: number;
      tablesServed: number[];
      paymentsCollected: number;
      revenueCollectedPaise: number;
    }>;
  };
  activity: {
    orders: number;
    items: number;
    paymentCount: number;
    activeTables: number;
    guestRequests: number;
    index: number;
  };
  trends: {
    orders: TrendValue;
    netRevenuePaise: TrendValue;
    onTimePercent: TrendValue;
    avgServeMs: TrendValue;
    overdue: TrendValue;
    refundsPaise: TrendValue;
    errors: TrendValue;
  };
  hrefs: {
    overview: string;
    operations: string;
    sla: string;
    financial: string;
    staff: string;
    logs: string;
    errors: string;
    paymentsFailed: string;
    printingAmbiguous: string;
    security: string;
  };
};

export type CommandCenterSummary = {
  tenantCount: number;
  restaurantCount: number;
  enabledRestaurants: number;
  activeNow: number;
  orders: number;
  netCapturedPaise: number;
  onTimePercent: number | null;
  slaSample: number;
  slaLabel: string;
  needAttention: number;
};

export type RankingRow = {
  key: string;
  label: string;
  restaurantId: string;
  restaurantName: string;
  value: number;
  display: string;
};

export type CommandCenterPayload = {
  range: {
    preset: string;
    from: string;
    to: string;
    fromDate: string;
    toDate: string;
    label: string;
  };
  generatedAt: string;
  summary: CommandCenterSummary;
  restaurants: RestaurantCommandRow[];
  rankings?: RankingRow[];
  tenant?: {
    id: string;
    name: string;
    slug: string;
    enabled: boolean;
  };
};
