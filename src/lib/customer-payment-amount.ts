import { isValidUpiVpa } from "@/lib/upi-intent";

/** Server tab remaining only. Never fall back to raw item totals. */
export function resolveCanonicalCustomerDue(
  tabRemaining: number | null | undefined,
): number | null {
  if (typeof tabRemaining !== "number" || !Number.isFinite(tabRemaining)) return null;
  if (tabRemaining < 0) return 0;
  return tabRemaining;
}

export function canStartCustomerPayment(canonicalDue: number | null): boolean {
  return canonicalDue != null && canonicalDue > 0;
}

/**
 * Manual UPI intent is only safe for a single unpaid order, where the
 * displayed amount, UPI amount, and ledger pending row are the same.
 */
export function shouldOfferManualUpiIntent(params: {
  canonicalDue: number | null;
  unpaidOrderCount: number;
  upiVpa?: string | null;
}): boolean {
  if (!canStartCustomerPayment(params.canonicalDue)) return false;
  if (params.unpaidOrderCount !== 1) return false;
  return isValidUpiVpa(params.upiVpa);
}

export function shouldOfferRazorpayCheckout(params: {
  canonicalDue: number | null;
  unpaidOrderCount: number;
  automaticUpiEnabled?: boolean;
}) {
  if (!canStartCustomerPayment(params.canonicalDue)) return false;
  if (params.unpaidOrderCount !== 1) return false;
  return Boolean(params.automaticUpiEnabled);
}

export function customerPaymentAction(params: {
  unpaidOrderCount: number;
  upiVpa?: string | null;
  automaticUpiEnabled?: boolean;
}): "initiate-manual-upi" | "request-payment" {
  if (params.unpaidOrderCount > 1) return "request-payment";
  if (params.automaticUpiEnabled) return "request-payment";
  return isValidUpiVpa(params.upiVpa) ? "initiate-manual-upi" : "request-payment";
}
