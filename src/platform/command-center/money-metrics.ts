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

  const netCapturedPaise = Math.max(0, subtractPaise(capturedGrossPaise, refundsPaise));
  return {
    capturedGrossPaise,
    refundsPaise,
    netCapturedPaise,
    cashPaise,
    manualUpiPaise,
    automaticGatewayPaise,
    paymentCount,
    capturedOrderCount: capturedOrderIds.size,
    avgCapturedOrderPaise: capturedOrderIds.size > 0 ? Math.round(netCapturedPaise / capturedOrderIds.size) : null,
  };
}
