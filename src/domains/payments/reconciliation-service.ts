import { prisma } from "@/lib/prisma";
import { todayDateString } from "@/lib/utils";
import { fromPaise, toPaise } from "@/lib/money";
import { financialsForOrder, isCapturedPayment, isRefundPayment } from "@/lib/order-financials";
import type { ReconciliationStatus } from "@/generated/prisma/client";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/platform/forensics/constants";
import { appendPlatformAuditEventInTx } from "@/platform/forensics/platform-audit-service";

export async function runDailyReconciliation(restaurantId: string, date?: string) {
  const periodDate = date ?? todayDateString();
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { tenantId: true, receiptGstEnabled: true, receiptGstRate: true },
  });
  const tenantId = restaurant?.tenantId ?? null;

  const orders = await prisma.order.findMany({
    where: { restaurantId, date: periodDate, status: { not: "CANCELLED" } },
    include: { items: true, payments: true, bills: true },
  });

  let expectedPaise = 0;
  let outstandingPaise = 0;
  for (const order of orders) {
    const financials = financialsForOrder({
      items: order.items,
      discountAmount: order.discountAmount,
      payments: order.payments,
      gstEnabled: restaurant?.receiptGstEnabled,
      gstRate: restaurant?.receiptGstRate,
    });
    const bill = order.bills.find((row) => row.status === "FINALIZED");
    const grandTotalPaise = bill ? toPaise(bill.grandTotal) : financials.grandTotalPaise;
    expectedPaise += grandTotalPaise;
    outstandingPaise += bill
      ? Math.max(0, grandTotalPaise - financials.netPaidPaise)
      : financials.amountDuePaise;
  }

  const dayStart = new Date(`${periodDate}T00:00:00`);
  const dayEnd = new Date(`${periodDate}T23:59:59.999`);
  const payments = await prisma.payment.findMany({
    where: {
      restaurantId,
      createdAt: { gte: dayStart, lt: dayEnd },
    },
  });

  let capturedPaise = 0;
  let cashPaise = 0;
  let manualUpiPaise = 0;
  let automaticUpiPaise = 0;
  let refundsPaise = 0;

  for (const payment of payments) {
    const paise = toPaise(payment.amount);
    if (isRefundPayment(payment)) {
      refundsPaise += paise;
      capturedPaise -= paise;
      if (payment.method === "CASH") cashPaise -= paise;
      else if (payment.method === "MANUAL_UPI") manualUpiPaise -= paise;
      else if (payment.method === "UPI" || payment.provider) automaticUpiPaise -= paise;
      continue;
    }
    if (!isCapturedPayment(payment)) continue;
    capturedPaise += paise;
    if (payment.method === "CASH") cashPaise += paise;
    else if (payment.method === "MANUAL_UPI") manualUpiPaise += paise;
    else if (payment.method === "UPI" || payment.provider) automaticUpiPaise += paise;
  }

  const receivedPaise = capturedPaise;
  const expectedTotal = fromPaise(expectedPaise);
  const receivedTotal = fromPaise(receivedPaise);
  const variance = fromPaise(receivedPaise - expectedPaise);
  const cashExpected = fromPaise(cashPaise);
  const refundsTotal = fromPaise(refundsPaise);
  const outstandingTotal = fromPaise(outstandingPaise);

  let status: ReconciliationStatus = "BALANCED";
  if (Math.abs(variance) > 0.01) status = "VARIANCE";
  if (orders.length === 0 && payments.length === 0) status = "OPEN";

  const anomalies: Array<{ type: string; amount: number; message: string }> = [];
  if (Math.abs(variance) > 0.01) {
    anomalies.push({
      type: "TOTAL_VARIANCE",
      amount: variance,
      message: `Captured payments differ from expected sales by ₹${Math.abs(variance).toFixed(2)}`,
    });
  }
  if (outstandingTotal > 0.01) {
    anomalies.push({
      type: "OUTSTANDING_BILLS",
      amount: outstandingTotal,
      message: `Outstanding bills ₹${outstandingTotal.toFixed(2)}`,
    });
  }

  const details = JSON.stringify({
    orderCount: orders.length,
    paymentCount: payments.length,
    paidOrders: orders.filter((o) => o.paidAt).length,
    anomalies,
  });

  return prisma.$transaction(async (tx) => {
    const row = await tx.paymentReconciliation.upsert({
      where: { restaurantId_periodDate: { restaurantId, periodDate } },
      create: {
        restaurantId,
        tenantId,
        periodDate,
        expectedTotal,
        receivedTotal,
        variance,
        cashExpected,
        refundsTotal,
        outstandingTotal,
        manualUpiTotal: fromPaise(manualUpiPaise),
        automaticUpiTotal: fromPaise(automaticUpiPaise),
        status,
        details,
      },
      update: {
        expectedTotal,
        receivedTotal,
        variance,
        cashExpected,
        refundsTotal,
        outstandingTotal,
        manualUpiTotal: fromPaise(manualUpiPaise),
        automaticUpiTotal: fromPaise(automaticUpiPaise),
        status,
        details,
        tenantId,
      },
    });
    await appendPlatformAuditEventInTx(tx, {
      category: AUDIT_CATEGORY.MONEY,
      action: AUDIT_ACTION.PAYMENT_RECONCILED,
      restaurantId,
      tenantId,
      resourceType: "PaymentReconciliation",
      resourceId: row.id,
      after: {
        periodDate,
        status: row.status,
        expectedTotal: row.expectedTotal,
        receivedTotal: row.receivedTotal,
        variance: row.variance,
      },
    });
    return row;
  });
}

export async function recordCashCount(params: {
  restaurantId: string;
  periodDate?: string;
  cashCounted: number;
}) {
  const row = await runDailyReconciliation(params.restaurantId, params.periodDate);
  const cashVariance = fromPaise(toPaise(params.cashCounted) - toPaise(row.cashExpected));
  return prisma.paymentReconciliation.update({
    where: { id: row.id },
    data: {
      cashCounted: params.cashCounted,
      cashVariance,
      status: Math.abs(cashVariance) > 0.01 || Math.abs(row.variance) > 0.01 ? "VARIANCE" : "BALANCED",
    },
  });
}

export async function listReconciliations(restaurantId: string, limit = 30) {
  return prisma.paymentReconciliation.findMany({
    where: { restaurantId },
    orderBy: { periodDate: "desc" },
    take: limit,
  });
}
