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

export type OrderFinancialInput = {
  items: FinancialLineItem[];
  discountAmount?: number | null;
  capturedPaymentTotal?: number | null;
  refundedTotal?: number | null;
  gstEnabled?: boolean;
  gstRate?: number | null;
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

/**
 * Canonical server-side totals.
 * Served items only. Order-level discount is applied once. GST is optional
 * restaurant receipt tax (CGST/SGST split). No service charge yet.
 */
export function computeOrderFinancials(input: OrderFinancialInput): OrderFinancialSummary {
  const itemSubtotalPaise = input.items.reduce((sum, item) => {
    if (!countsTowardRevenue(item.status)) return sum;
    return addPaise(sum, toPaise(item.unitPrice) * Math.max(0, Math.round(item.quantity)));
  }, 0);

  const orderDiscountPaise = minPaise(toPaise(input.discountAmount ?? 0), itemSubtotalPaise);
  const taxableSubtotalPaise = subtractPaise(itemSubtotalPaise, orderDiscountPaise);

  const gstEnabled = Boolean(input.gstEnabled);
  const gstRate = Math.max(0, Number(input.gstRate) || 0);
  const gstPaise = gstEnabled ? Math.round((taxableSubtotalPaise * gstRate) / 100) : 0;
  const cgstPaise = Math.round(gstPaise / 2);
  const sgstPaise = subtractPaise(gstPaise, cgstPaise);

  const grandTotalPaise = addPaise(taxableSubtotalPaise, gstPaise);
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
}): OrderFinancialSummary {
  return computeOrderFinancials({
    items: params.items,
    discountAmount: params.discountAmount,
    capturedPaymentTotal: capturedPaymentsTotal(params.payments ?? []),
    refundedTotal: refundedPaymentsTotal(params.payments ?? []),
    gstEnabled: params.gstEnabled,
    gstRate: params.gstRate,
  });
}
