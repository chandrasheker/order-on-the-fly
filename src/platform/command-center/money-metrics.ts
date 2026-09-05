import {
  isCapturedPayment,
  isRefundPayment,
  type LedgerPayment,
} from "@/lib/order-financials";
import { addPaise, subtractPaise, toPaise } from "@/lib/money";

export type LedgerPaymentWithMethod = LedgerPayment & {
  method?: string | null;
  provider?: string | null;
  orderId?: string | null;
};

export function ledgerRevenueFromPayments(payments: LedgerPaymentWithMethod[]) {
  let capturedGrossPaise = 0;
  let refundsPaise = 0;
  let cashPaise = 0;
  let manualUpiPaise = 0;
  let automaticGatewayPaise = 0;
  let paymentCount = 0;
  const capturedOrderIds = new Set<string>();

  for (const payment of payments) {
    const paise = toPaise(payment.amount);
    if (isRefundPayment(payment)) {
      refundsPaise = addPaise(refundsPaise, paise);
      continue;
    }
    if (!isCapturedPayment(payment)) continue;
    capturedGrossPaise = addPaise(capturedGrossPaise, paise);
    paymentCount += 1;
    if (payment.orderId) capturedOrderIds.add(payment.orderId);
    if (payment.method === "CASH") {
      cashPaise = addPaise(cashPaise, paise);
    } else if (payment.method === "MANUAL_UPI") {
      manualUpiPaise = addPaise(manualUpiPaise, paise);
    } else {
      automaticGatewayPaise = addPaise(automaticGatewayPaise, paise);
    }
  }

  const netCapturedPaise = subtractPaise(capturedGrossPaise, refundsPaise);
  return {
    capturedGrossPaise,
    refundsPaise,
    netCapturedPaise,
    cashPaise,
    manualUpiPaise,
    automaticGatewayPaise,
    paymentCount,
    capturedOrderCount: capturedOrderIds.size,
    avgCapturedOrderPaise:
      capturedOrderIds.size > 0 ? Math.round(capturedGrossPaise / capturedOrderIds.size) : null,
  };
}

export function staffCollectedFromPayments(
  payments: Array<LedgerPaymentWithMethod & { collectedByUserId?: string | null; collectedByName?: string | null }>,
) {
  let paymentsCollected = 0;
  let revenueCollectedPaise = 0;
  for (const payment of payments) {
    if (!isCapturedPayment(payment)) continue;
    paymentsCollected += 1;
    revenueCollectedPaise = addPaise(revenueCollectedPaise, toPaise(payment.amount));
  }
  return { paymentsCollected, revenueCollectedPaise };
}
