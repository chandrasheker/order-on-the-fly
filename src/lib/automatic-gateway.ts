import { decryptSecret } from "@/lib/credential-crypto";

export function readWebhookSecret(restaurant: {
  paymentWebhookSecretEnc?: string | null;
  paymentWebhookSecret?: string | null;
}) {
  const enc = decryptSecret(restaurant.paymentWebhookSecretEnc);
  if (enc) return enc;
  return restaurant.paymentWebhookSecret?.trim() || "";
}

export function readGatewayKeySecret(restaurant: { paymentGatewaySecretEnc?: string | null }) {
  return decryptSecret(restaurant.paymentGatewaySecretEnc);
}

export function isRazorpayAutomaticReady(restaurant: {
  paymentGatewayProvider?: string | null;
  paymentGatewayKeyId?: string | null;
  paymentGatewaySecretEnc?: string | null;
  paymentWebhookSecretEnc?: string | null;
  paymentWebhookSecret?: string | null;
}) {
  if ((restaurant.paymentGatewayProvider ?? "").toUpperCase() !== "RAZORPAY") return false;
  if (!restaurant.paymentGatewayKeyId?.trim()) return false;
  if (!readGatewayKeySecret(restaurant)) return false;
  if (!readWebhookSecret(restaurant)) return false;
  return true;
}
