import { verifyRazorpayWebhookSignature } from "@/lib/razorpay-client";

export type PaymentProviderName = "cash" | "manual_upi" | "razorpay" | "phonepe" | "paytm";

export type ProviderWebhookResult = {
  ok: boolean;
  error?: string;
};

export interface PaymentProvider {
  name: PaymentProviderName;
  verifyWebhook(rawBody: string, headers: Headers, secret: string): ProviderWebhookResult;
}

export const cashPaymentProvider: PaymentProvider = {
  name: "cash",
  verifyWebhook() {
    return { ok: false, error: "Cash has no webhook" };
  },
};

export const manualUpiPaymentProvider: PaymentProvider = {
  name: "manual_upi",
  verifyWebhook() {
    return { ok: false, error: "Manual UPI is staff-verified" };
  },
};

export const razorpayPaymentProvider: PaymentProvider = {
  name: "razorpay",
  verifyWebhook(rawBody, headers, secret) {
    const sig = headers.get("x-razorpay-signature");
    if (!sig || !verifyRazorpayWebhookSignature(rawBody, sig, secret)) {
      return { ok: false, error: "Invalid signature" };
    }
    return { ok: true };
  },
};

function verifySharedSecret(headers: Headers, secret: string): ProviderWebhookResult {
  const token = headers.get("authorization") ?? headers.get("x-webhook-secret");
  if (token !== `Bearer ${secret}` && token !== secret) {
    return { ok: false, error: "Invalid webhook secret" };
  }
  return { ok: true };
}

export const phonepePaymentProvider: PaymentProvider = {
  name: "phonepe",
  verifyWebhook(_rawBody, headers, secret) {
    return verifySharedSecret(headers, secret);
  },
};

export const paytmPaymentProvider: PaymentProvider = {
  name: "paytm",
  verifyWebhook(_rawBody, headers, secret) {
    return verifySharedSecret(headers, secret);
  },
};

export function getPaymentProvider(name: string | null | undefined): PaymentProvider | null {
  switch ((name ?? "").toLowerCase()) {
    case "razorpay":
      return razorpayPaymentProvider;
    case "phonepe":
      return phonepePaymentProvider;
    case "paytm":
      return paytmPaymentProvider;
    case "cash":
      return cashPaymentProvider;
    case "manual_upi":
      return manualUpiPaymentProvider;
    default:
      return null;
  }
}

export function amountsMatchPaise(expected: number, actual: number) {
  return Math.abs(Math.round(expected * 100) - Math.round(actual * 100)) <= 1;
}
