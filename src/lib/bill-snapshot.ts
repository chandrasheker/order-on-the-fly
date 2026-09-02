import { computeOrderFinancials, type OrderFinancialSummary } from "@/lib/order-financials";
import type { ReceiptPayload } from "@/lib/receipt-service";

export const BILL_SNAPSHOT_VERSION = 1 as const;

export type BillRestaurantSnapshot = {
  name: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  gstEnabled: boolean;
  gstRate: number;
  footer: string | null;
};

export type BillItemSnapshot = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  status: string;
};

export type BillSnapshotV1 = {
  version: typeof BILL_SNAPSHOT_VERSION;
  billNumber: string;
  restaurant: BillRestaurantSnapshot;
  branch: { name: string; address: string | null } | null;
  order: {
    id: string;
    orderNumber: number;
    tableNumber: number;
    customerName: string | null;
  };
  items: BillItemSnapshot[];
  financials: {
    itemSubtotal: number;
    orderDiscount: number;
    taxableSubtotal: number;
    gstAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    grandTotal: number;
  };
  finalizedAt: string;
};

export function buildBillSnapshot(params: {
  billNumber: string;
  restaurant: {
    name: string;
    logoUrl: string | null;
    receiptAddress: string | null;
    receiptPhone: string | null;
    receiptGstin: string | null;
    receiptGstEnabled: boolean;
    receiptGstRate: number;
    receiptFooter: string | null;
  };
  branch?: { name: string; address: string | null } | null;
  order: {
    id: string;
    orderNumber: number;
    customerName: string | null;
    table: { number: number };
    items: Array<{ itemName: string; quantity: number; unitPrice: number; status: string }>;
    discountAmount?: number | null;
  };
  financials: OrderFinancialSummary;
  finalizedAt?: Date;
}): BillSnapshotV1 {
  const finalizedAt = (params.finalizedAt ?? new Date()).toISOString();
  return {
    version: BILL_SNAPSHOT_VERSION,
    billNumber: params.billNumber,
    restaurant: {
      name: params.restaurant.name,
      logoUrl: params.restaurant.logoUrl,
      address: params.restaurant.receiptAddress,
      phone: params.restaurant.receiptPhone,
      gstin: params.restaurant.receiptGstin,
      gstEnabled: params.restaurant.receiptGstEnabled,
      gstRate: params.restaurant.receiptGstEnabled ? Math.max(0, params.restaurant.receiptGstRate) : 0,
      footer: params.restaurant.receiptFooter,
    },
    branch: params.branch ?? null,
    order: {
      id: params.order.id,
      orderNumber: params.order.orderNumber,
      tableNumber: params.order.table.number,
      customerName: params.order.customerName,
    },
    items: params.order.items
      .filter((item) => item.status !== "UNAVAILABLE")
      .map((item) => ({
        name: item.itemName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.unitPrice * item.quantity,
        status: item.status,
      })),
    financials: {
      itemSubtotal: params.financials.itemSubtotal,
      orderDiscount: params.financials.orderDiscount,
      taxableSubtotal: params.financials.taxableSubtotal,
      gstAmount: params.financials.gstAmount,
      cgstAmount: params.financials.cgstAmount,
      sgstAmount: params.financials.sgstAmount,
      grandTotal: params.financials.grandTotal,
    },
    finalizedAt,
  };
}

export function parseBillSnapshot(raw: string): BillSnapshotV1 | null {
  try {
    const parsed = JSON.parse(raw) as BillSnapshotV1;
    if (!parsed || parsed.version !== BILL_SNAPSHOT_VERSION || !parsed.billNumber) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function receiptFromBillSnapshot(snapshot: BillSnapshotV1): ReceiptPayload {
  return {
    restaurant: snapshot.restaurant,
    order: {
      id: snapshot.order.id,
      orderNumber: snapshot.order.orderNumber,
      tableNumber: snapshot.order.tableNumber,
      customerName: snapshot.order.customerName,
      paidAt: snapshot.finalizedAt,
      billNumber: snapshot.billNumber,
    },
    items: snapshot.items,
    subtotal: snapshot.financials.itemSubtotal,
    discountAmount: snapshot.financials.orderDiscount,
    gstAmount: snapshot.financials.gstAmount,
    cgstAmount: snapshot.financials.cgstAmount,
    sgstAmount: snapshot.financials.sgstAmount,
    total: snapshot.financials.grandTotal,
  };
}

/** Recompute live financials for comparison tests — snapshot must ignore later restaurant/menu changes. */
export function liveFinancialsForSnapshotInput(params: {
  items: Array<{ unitPrice: number; quantity: number; status: string }>;
  discountAmount?: number | null;
  gstEnabled?: boolean;
  gstRate?: number | null;
}) {
  return computeOrderFinancials({
    items: params.items,
    discountAmount: params.discountAmount,
    gstEnabled: params.gstEnabled,
    gstRate: params.gstRate,
  });
}
