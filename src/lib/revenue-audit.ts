import { parseBillSnapshot } from "@/lib/bill-snapshot";
import { addPaise, fromPaise, toPaise } from "@/lib/money";
import { formatCurrency, sumOrderRevenue } from "@/lib/utils";

export type RevenueBillView = {
  collected: number;
  itemSubtotal: number;
  gstAmount: number;
  gstInclusive: boolean;
};

type FinalizedBillInput = {
  status?: string | null;
  grandTotal: number;
  itemSubtotal: number;
  gstAmount?: number | null;
  snapshot?: string | null;
};

function isFinalizedBill(bill: { status?: string | null } | null | undefined) {
  return Boolean(bill) && (bill?.status == null || bill.status === "FINALIZED");
}

/** Prefer the frozen bill; infer exclusive GST when collected is items + tax. */
export function revenueBillViewFromFinalizedBill(
  bill: FinalizedBillInput | null | undefined,
  fallbackItemSubtotal: number,
): RevenueBillView {
  if (!isFinalizedBill(bill) || !bill) {
    return {
      collected: fallbackItemSubtotal,
      itemSubtotal: fallbackItemSubtotal,
      gstAmount: 0,
      gstInclusive: true,
    };
  }

  const snapshot = bill.snapshot ? parseBillSnapshot(bill.snapshot) : null;
  const collected = Number(bill.grandTotal) || 0;
  const itemSubtotal = Number(bill.itemSubtotal) || 0;
  const gstAmount = Number(bill.gstAmount) || 0;
  const gstInclusive = snapshot
    ? snapshot.restaurant.gstInclusive === true
    : Math.abs(collected - itemSubtotal) < 0.005;

  return { collected, itemSubtotal, gstAmount, gstInclusive };
}

/** Owner-facing line under a collected total so ₹90 items + GST is not mistaken for the bill. */
export function gstBreakdownHintText(view: {
  itemSubtotal: number;
  gstAmount: number;
  gstInclusive?: boolean;
}) {
  if (!(Number(view.gstAmount) > 0)) return null;
  if (view.gstInclusive !== false) return `incl. GST ${formatCurrency(view.gstAmount)}`;
  return `${formatCurrency(view.itemSubtotal)} + GST ${formatCurrency(view.gstAmount)}`;
}

export function sumFinalizedGst(
  bills: Array<{ status?: string | null; gstAmount?: number | null }>,
) {
  return fromPaise(
    bills.reduce((sum, bill) => {
      if (!isFinalizedBill(bill)) return sum;
      return addPaise(sum, toPaise(bill.gstAmount ?? 0));
    }, 0),
  );
}

export function staffCompletedOrderRevenuePayload(order: {
  items: Array<{ unitPrice: number; quantity: number; status: string }>;
  paidAt?: Date | string | null;
  bills?: FinalizedBillInput[] | null;
}) {
  const itemSubtotal = sumOrderRevenue(order.items);
  const bill = order.bills?.find((row) => isFinalizedBill(row)) ?? null;
  const view = revenueBillViewFromFinalizedBill(bill, itemSubtotal);
  return {
    total: view.collected,
    paidTotal: order.paidAt ? view.collected : 0,
    itemSubtotal: view.itemSubtotal,
    gstAmount: view.gstAmount,
    gstInclusive: view.gstInclusive,
  };
}
