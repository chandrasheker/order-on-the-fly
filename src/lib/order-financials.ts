import { countsTowardRevenue } from "@/lib/utils";

/** One paisa in rupees — used for paid/unpaid comparisons. */
export const FINANCIAL_PAID_EPSILON = 0.01;
import {
  addPaise,
  clampPaise,
  fromPaise,
  maxPaise,
  minPaise,
  subtractPaise,
  toPaise,
} from "@/lib/money";

export type FinancialLineItem = {
  unitPrice: number;
  quantity: number;
  status: string;
};

export type RestaurantGstSettings = {
  receiptGstEnabled?: boolean | null;
  receiptGstRate?: number | null;
  receiptGstInclusive?: boolean | null;
};

export const RESTAURANT_GST_SELECT = {
  receiptGstEnabled: true,
  receiptGstRate: true,
  receiptGstInclusive: true,
} as const;

/** Missing flag is treated as included-in-MRP so bills are not inflated. */
export function isGstInclusive(value: boolean | null | undefined): boolean {
  return value !== false;
}

export function gstInputFromRestaurant(restaurant?: RestaurantGstSettings | null): {
  gstEnabled: boolean;
  gstRate: number | null | undefined;
  gstInclusive: boolean;
} {
  return {
    gstEnabled: Boolean(restaurant?.receiptGstEnabled),
    gstRate: restaurant?.receiptGstRate,
    gstInclusive: isGstInclusive(restaurant?.receiptGstInclusive),
  };
}

export type OrderFinancialInput = {
  items: FinancialLineItem[];
  discountAmount?: number | null;
  capturedPaymentTotal?: number | null;
  refundedTotal?: number | null;
  gstEnabled?: boolean;
  gstRate?: number | null;
  gstInclusive?: boolean;
};

export type OrderFinancialSummary = {
  itemSubtotalPaise: number;
  orderDiscountPaise: number;
  taxableSubtotalPaise: number;
  gstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  grandTotalPaise: number;
  capturedPaymentPaise: number;
  refundedPaise: number;
  netPaidPaise: number;
  amountDuePaise: number;
  itemSubtotal: number;
  orderDiscount: number;
  taxableSubtotal: number;
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  grandTotal: number;
  capturedPaymentTotal: number;
  refundedTotal: number;
  netPaid: number;
  amountDue: number;
  fullyPaid: boolean;
};

function rupeeView(paise: number): number {
  return fromPaise(paise);
}

function gstBreakdownFromNetPaise(
  netPaise: number,
  gstEnabled: boolean,
  gstRate: number,
  gstInclusive: boolean,
): { taxableSubtotalPaise: number; gstPaise: number; grandTotalPaise: number } {
  if (!gstEnabled || gstRate <= 0 || netPaise <= 0) {
    return { taxableSubtotalPaise: netPaise, gstPaise: 0, grandTotalPaise: netPaise };
  }
  if (gstInclusive) {
    const taxableSubtotalPaise = Math.round((netPaise * 100) / (100 + gstRate));
    const gstPaise = subtractPaise(netPaise, taxableSubtotalPaise);
    return { taxableSubtotalPaise, gstPaise, grandTotalPaise: netPaise };
  }
  const gstPaise = Math.round((netPaise * gstRate) / 100);
  return {
    taxableSubtotalPaise: netPaise,
    gstPaise,
    grandTotalPaise: addPaise(netPaise, gstPaise),
  };
}

/**
 * Canonical server-side totals.
 * Served items only. Order-level discount is applied once. GST is optional
 * restaurant receipt tax (CGST/SGST split). Menu prices are treated as
 * GST-inclusive MRP unless `gstInclusive` is false. No service charge yet.
 */
export function computeOrderFinancials(input: OrderFinancialInput): OrderFinancialSummary {
  const itemSubtotalPaise = input.items.reduce((sum, item) => {
    if (!countsTowardRevenue(item.status)) return sum;
    return addPaise(sum, toPaise(item.unitPrice) * Math.max(0, Math.round(item.quantity)));
  }, 0);

  const orderDiscountPaise = minPaise(toPaise(input.discountAmount ?? 0), itemSubtotalPaise);
  const netPaise = subtractPaise(itemSubtotalPaise, orderDiscountPaise);

  const gstEnabled = Boolean(input.gstEnabled);
  const gstRate = Math.max(0, Number(input.gstRate) || 0);
  const gstInclusive = isGstInclusive(input.gstInclusive);
  const { taxableSubtotalPaise, gstPaise, grandTotalPaise } = gstBreakdownFromNetPaise(
    netPaise,
    gstEnabled,
    gstRate,
    gstInclusive,
  );
  const cgstPaise = Math.round(gstPaise / 2);
  const sgstPaise = subtractPaise(gstPaise, cgstPaise);
  const capturedPaymentPaise = clampPaise(toPaise(input.capturedPaymentTotal ?? 0));
  const refundedPaise = clampPaise(toPaise(input.refundedTotal ?? 0));
  const netPaidPaise = maxPaise(0, subtractPaise(capturedPaymentPaise, refundedPaise));
  const amountDuePaise = maxPaise(0, subtractPaise(grandTotalPaise, netPaidPaise));

  return {
    itemSubtotalPaise,
    orderDiscountPaise,
    taxableSubtotalPaise,
    gstPaise,
    cgstPaise,
    sgstPaise,
    grandTotalPaise,
    capturedPaymentPaise,
    refundedPaise,
    netPaidPaise,
    amountDuePaise,
    itemSubtotal: rupeeView(itemSubtotalPaise),
    orderDiscount: rupeeView(orderDiscountPaise),
    taxableSubtotal: rupeeView(taxableSubtotalPaise),
    gstAmount: rupeeView(gstPaise),
    cgstAmount: rupeeView(cgstPaise),
    sgstAmount: rupeeView(sgstPaise),
    grandTotal: rupeeView(grandTotalPaise),
    capturedPaymentTotal: rupeeView(capturedPaymentPaise),
    refundedTotal: rupeeView(refundedPaise),
    netPaid: rupeeView(netPaidPaise),
    amountDue: rupeeView(amountDuePaise),
    fullyPaid: grandTotalPaise <= 0 || amountDuePaise <= 0,
  };
}

export const PAYMENT_STATUS = {
  INITIATED: "INITIATED",
  PENDING: "PENDING",
  CAPTURED: "CAPTURED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
  VOIDED: "VOIDED",
} as const;

export const MANUAL_UPI_VERIFICATION = {
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
} as const;

export type LedgerPayment = {
  amount: number;
  status?: string | null;
  refundOfPaymentId?: string | null;
};

export function isRefundPayment(payment: LedgerPayment): boolean {
  return Boolean(payment.refundOfPaymentId) || payment.status === PAYMENT_STATUS.REFUNDED;
}

/** Legacy rows have no status; treat them as already collected. */
export function isCapturedPayment(payment: LedgerPayment): boolean {
  if (isRefundPayment(payment)) return false;
  if (!payment.status || payment.status === PAYMENT_STATUS.CAPTURED) return true;
  return false;
}

export function capturedPaymentsTotal(payments: LedgerPayment[]): number {
  return fromPaise(
    payments.reduce((sum, payment) => {
      if (!isCapturedPayment(payment)) return sum;
      return addPaise(sum, toPaise(payment.amount));
    }, 0),
  );
}

export function refundedPaymentsTotal(payments: LedgerPayment[]): number {
  return fromPaise(
    payments.reduce((sum, payment) => {
      if (!isRefundPayment(payment)) return sum;
      return addPaise(sum, toPaise(payment.amount));
    }, 0),
  );
}

export function financialsForOrder(params: {
  items: FinancialLineItem[];
  discountAmount?: number | null;
  payments?: LedgerPayment[];
  gstEnabled?: boolean;
  gstRate?: number | null;
  gstInclusive?: boolean;
}): OrderFinancialSummary {
  return computeOrderFinancials({
    items: params.items,
    discountAmount: params.discountAmount,
    capturedPaymentTotal: capturedPaymentsTotal(params.payments ?? []),
    refundedTotal: refundedPaymentsTotal(params.payments ?? []),
    gstEnabled: params.gstEnabled,
    gstRate: params.gstRate,
    gstInclusive: params.gstInclusive,
  });
}

/**
 * SELF_PICKUP bills required/non-UNAVAILABLE items before collection.
 * Projection only — OrderItem rows stay READY until Mark Collected.
 * TABLE_SERVICE stays served-only.
 */
export function projectItemsForFinancials<T extends { status: string }>(
  fulfillmentMode: string | null | undefined,
  items: T[],
): T[] {
  if (fulfillmentMode !== "SELF_PICKUP") {
    return items;
  }
  return items.map((item) =>
    item.status === "UNAVAILABLE" ? item : { ...item, status: "SERVED" as T["status"] },
  );
}

export type FinalizedBillTotals = {
  status?: string | null;
  grandTotal: number;
  itemSubtotal?: number;
  orderDiscount?: number;
  gstAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
};

export function applyFinalizedBillToFinancials(
  financials: OrderFinancialSummary,
  bill: FinalizedBillTotals | null | undefined,
): OrderFinancialSummary {
  if (!bill || (bill.status != null && bill.status !== "FINALIZED")) {
    return financials;
  }
  const grandTotalPaise = toPaise(bill.grandTotal);
  const amountDuePaise = maxPaise(0, subtractPaise(grandTotalPaise, financials.netPaidPaise));
  const amountDue = rupeeView(amountDuePaise);
  return {
    ...financials,
    itemSubtotal: bill.itemSubtotal ?? financials.itemSubtotal,
    orderDiscount: bill.orderDiscount ?? financials.orderDiscount,
    gstAmount: bill.gstAmount ?? financials.gstAmount,
    cgstAmount: bill.cgstAmount ?? financials.cgstAmount,
    sgstAmount: bill.sgstAmount ?? financials.sgstAmount,
    grandTotal: bill.grandTotal,
    amountDue,
    fullyPaid: amountDuePaise <= 0,
    itemSubtotalPaise: bill.itemSubtotal != null ? toPaise(bill.itemSubtotal) : financials.itemSubtotalPaise,
    orderDiscountPaise: bill.orderDiscount != null ? toPaise(bill.orderDiscount) : financials.orderDiscountPaise,
    gstPaise: bill.gstAmount != null ? toPaise(bill.gstAmount) : financials.gstPaise,
    cgstPaise: bill.cgstAmount != null ? toPaise(bill.cgstAmount) : financials.cgstPaise,
    sgstPaise: bill.sgstAmount != null ? toPaise(bill.sgstAmount) : financials.sgstPaise,
    grandTotalPaise,
    amountDuePaise,
  };
}

/** One M1/M2 path for payment, bill projection, and collection outstanding. */
export function canonicalFinancialsForOrder(order: {
  fulfillmentMode?: string | null;
  items: FinancialLineItem[];
  payments?: LedgerPayment[];
  discountAmount?: number | null;
  gstEnabled?: boolean;
  gstRate?: number | null;
  gstInclusive?: boolean;
  finalizedBill?: FinalizedBillTotals | null;
}): OrderFinancialSummary {
  const financials = financialsForOrder({
    items: projectItemsForFinancials(order.fulfillmentMode, order.items),
    payments: order.payments ?? [],
    discountAmount: order.discountAmount,
    gstEnabled: order.gstEnabled,
    gstRate: order.gstRate,
    gstInclusive: order.gstInclusive,
  });
  return applyFinalizedBillToFinancials(financials, order.finalizedBill);
}
