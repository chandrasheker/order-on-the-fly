export type FeatureTier = "core" | "premium" | "roadmap";

export type FeatureKey =
  | "qr_ordering"
  | "staff_dashboard"
  | "menu_admin"
  | "table_qr"
  | "payments"
  | "phonepe_qr"
  | "table_sessions"
  | "table_switch"
  | "rewards"
  | "feedback"
  | "basic_reports"
  | "alerts_timers"
  | "kds"
  | "floor_plan"
  | "split_bill"
  | "staff_performance"
  | "thermal_receipts"
  | "phone_orders"
  | "gst_receipts"
  | "inventory_86"
  | "labor_clock"
  | "reservations"
  | "aggregator_inbox"
  | "tip_pooling"
  | "guest_crm"
  | "audit_log"
  | "custom_background";

export interface FeatureDefinition {
  key: FeatureKey;
  name: string;
  problem: string;
  tier: FeatureTier;
  defaultEnabled: boolean;
  /** When true, toggle works but UI shows "coming soon" until built */
  roadmap?: boolean;
}

export const FEATURE_CATALOG: FeatureDefinition[] = [
  {
    key: "qr_ordering",
    name: "QR table ordering",
    problem: "Guests order without waiting for a waiter.",
    tier: "core",
    defaultEnabled: true,
  },
  {
    key: "staff_dashboard",
    name: "Staff live dashboard",
    problem: "Kitchen and floor see orders, timers, and alerts in real time.",
    tier: "core",
    defaultEnabled: true,
  },
  {
    key: "menu_admin",
    name: "Menu management",
    problem: "Owner updates items, prices, and today's special.",
    tier: "core",
    defaultEnabled: true,
  },
  {
    key: "table_qr",
    name: "Table QR codes",
    problem: "Printable QR per table with secure check-in.",
    tier: "core",
    defaultEnabled: true,
  },
  {
    key: "payments",
    name: "Mark paid & collect",
    problem: "Staff confirm cash/UPI after service.",
    tier: "core",
    defaultEnabled: true,
  },
  {
    key: "phonepe_qr",
    name: "PhonePe / UPI QR",
    problem: "Guest scans your static QR to pay from the table.",
    tier: "core",
    defaultEnabled: true,
  },
  {
    key: "table_sessions",
    name: "Table sessions & check-in",
    problem: "Stop remote QR abuse with rotating codes and session limits.",
    tier: "core",
    defaultEnabled: true,
  },
  {
    key: "table_switch",
    name: "Table change requests",
    problem: "Move guests and orders when they change tables.",
    tier: "core",
    defaultEnabled: true,
  },
  {
    key: "rewards",
    name: "Reward spins",
    problem: "Repeat visits with threshold-based rewards.",
    tier: "core",
    defaultEnabled: true,
  },
  {
    key: "feedback",
    name: "Guest feedback",
    problem: "Capture satisfaction after the meal.",
    tier: "core",
    defaultEnabled: true,
  },
  {
    key: "basic_reports",
    name: "Daily sales reports",
    problem: "CSV export of orders and revenue for the day.",
    tier: "core",
    defaultEnabled: true,
  },
  {
    key: "alerts_timers",
    name: "Prep timers & overdue alerts",
    problem: "Never miss a late ticket during rush hour.",
    tier: "core",
    defaultEnabled: true,
  },
  {
    key: "kds",
    name: "Kitchen Display (KDS)",
    problem: "Station-routed tickets replace paper chits and shouting.",
    tier: "premium",
    defaultEnabled: false,
  },
  {
    key: "floor_plan",
    name: "Floor plan & table timers",
    problem: "See every table, server, live bill, and seat time at a glance.",
    tier: "premium",
    defaultEnabled: false,
  },
  {
    key: "split_bill",
    name: "Split bill & partial pay",
    problem: "Groups pay by item or split evenly without calculator chaos.",
    tier: "premium",
    defaultEnabled: false,
  },
  {
    key: "staff_performance",
    name: "Team performance tracking",
    problem: "Know who prepped, served, and collected — end shift disputes.",
    tier: "premium",
    defaultEnabled: false,
  },
  {
    key: "thermal_receipts",
    name: "Bluetooth thermal receipts",
    problem: "Auto-print ESC/POS receipt when bill is settled.",
    tier: "premium",
    defaultEnabled: false,
  },
  {
    key: "phone_orders",
    name: "Phone / walk-in orders",
    problem: "Staff enters delivery and walk-in orders without guest QR scan.",
    tier: "premium",
    defaultEnabled: false,
  },
  {
    key: "gst_receipts",
    name: "GST receipt fields",
    problem: "GSTIN, tax rate, and compliant receipt footer on print.",
    tier: "premium",
    defaultEnabled: false,
  },
  {
    key: "custom_background",
    name: "Custom guest page background",
    problem: "Upload a branded photo shown behind the customer ordering screen.",
    tier: "premium",
    defaultEnabled: false,
  },
  {
    key: "inventory_86",
    name: "Inventory & auto-86",
    problem: "Item runs out → menu hides it instantly; no angry guests.",
    tier: "roadmap",
    defaultEnabled: false,
  },
  {
    key: "labor_clock",
    name: "Shift clock-in & SPLH",
    problem: "Tie sales to labor hours for staffing decisions.",
    tier: "roadmap",
    defaultEnabled: false,
  },
  {
    key: "reservations",
    name: "Reservations & waitlist",
    problem: "Queue phone bookings and SMS when table is ready.",
    tier: "roadmap",
    defaultEnabled: false,
  },
  {
    key: "aggregator_inbox",
    name: "Swiggy / Zomato inbox",
    problem: "Swiggy/Zomato orders auto-sync via webhook when credentials are saved — no manual entry.",
    tier: "premium",
    defaultEnabled: false,
  },
  {
    key: "tip_pooling",
    name: "Tip pooling & payout",
    problem: "Fair tip splits with export for payroll.",
    tier: "roadmap",
    defaultEnabled: false,
  },
  {
    key: "guest_crm",
    name: "Repeat guest CRM",
    problem: "Recognize regulars by phone and target rewards.",
    tier: "roadmap",
    defaultEnabled: false,
  },
  {
    key: "audit_log",
    name: "Audit log & void controls",
    problem: "Manager approval trail for voids, comps, and discounts.",
    tier: "roadmap",
    defaultEnabled: false,
  },
];

export const ALL_FEATURE_KEYS = FEATURE_CATALOG.map((f) => f.key);

export function getFeatureDefinition(key: FeatureKey): FeatureDefinition {
  const def = FEATURE_CATALOG.find((f) => f.key === key);
  if (!def) throw new Error(`Unknown feature: ${key}`);
  return def;
}

export function listFeaturesByTier(tier: FeatureTier) {
  return FEATURE_CATALOG.filter((f) => f.tier === tier);
}
