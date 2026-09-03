import { financialsForOrder } from "@/lib/order-financials";

export type ReceiptLineItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  status: string;
};

export type ReceiptPayload = {
  restaurant: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    gstin: string | null;
    gstEnabled: boolean;
    gstRate: number;
    footer: string | null;
  };
  order: {
    id: string;
    orderNumber: number;
    tableNumber: number;
    customerName: string | null;
    paidAt: string;
    billNumber?: string;
  };
  items: ReceiptLineItem[];
  subtotal: number;
  discountAmount?: number;
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  total: number;
};

type RestaurantReceiptFields = {
  name: string;
  logoUrl: string | null;
  receiptAddress: string | null;
  receiptPhone: string | null;
  receiptGstin: string | null;
  receiptGstEnabled: boolean;
  receiptGstRate: number;
  receiptFooter: string | null;
};

type OrderForReceipt = {
  id: string;
  orderNumber: number;
  customerName: string | null;
  paidAt: Date | null;
  discountAmount?: number | null;
  table: { number: number };
  items: Array<{
    itemName: string;
    quantity: number;
    unitPrice: number;
    status: string;
  }>;
};

export function buildReceiptPayload(
  restaurant: RestaurantReceiptFields,
  order: OrderForReceipt,
  paidAt: Date = new Date(),
): ReceiptPayload {
  const billableItems = order.items.filter((item) => item.status !== "UNAVAILABLE");
  const financials = financialsForOrder({
    items: order.items,
    discountAmount: order.discountAmount,
    gstEnabled: restaurant.receiptGstEnabled,
    gstRate: restaurant.receiptGstRate,
  });
  const gstRate = restaurant.receiptGstEnabled ? Math.max(0, restaurant.receiptGstRate) : 0;

  return {
    restaurant: {
      name: restaurant.name,
      logoUrl: restaurant.logoUrl,
      address: restaurant.receiptAddress,
      phone: restaurant.receiptPhone,
      gstin: restaurant.receiptGstin,
      gstEnabled: restaurant.receiptGstEnabled,
      gstRate,
      footer: restaurant.receiptFooter,
    },
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      tableNumber: order.table.number,
      customerName: order.customerName,
      paidAt: (order.paidAt ?? paidAt).toISOString(),
    },
    items: billableItems.map((item) => ({
      name: item.itemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.unitPrice * item.quantity,
      status: item.status,
    })),
    subtotal: financials.itemSubtotal,
    discountAmount: financials.orderDiscount,
    gstAmount: financials.gstAmount,
    cgstAmount: financials.cgstAmount,
    sgstAmount: financials.sgstAmount,
    total: financials.grandTotal,
  };
}

export const RECEIPT_RESTAURANT_SELECT = {
  name: true,
  logoUrl: true,
  receiptAddress: true,
  receiptPhone: true,
  receiptGstin: true,
  receiptGstEnabled: true,
  receiptGstRate: true,
  receiptFooter: true,
} as const;

export const RECEIPT_ORDER_INCLUDE = {
  table: { select: { number: true } },
  items: {
    select: {
      itemName: true,
      quantity: true,
      unitPrice: true,
      status: true,
    },
    orderBy: { expectedReadyAt: "asc" as const },
  },
} as const;

