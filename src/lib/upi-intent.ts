export type UpiIntentInput = {
  vpa: string;
  payeeName: string;
  amount: number;
  transactionRef: string;
  note?: string;
};

const VPA_RE = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;

export function isValidUpiVpa(vpa: string | null | undefined): boolean {
  return Boolean(vpa && VPA_RE.test(vpa.trim()));
}

export function formatUpiAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0.00";
  return (Math.round(amount * 100) / 100).toFixed(2);
}

function encodeQuery(params: Record<string, string>) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function buildUpiPayQuery(input: UpiIntentInput): string {
  return encodeQuery({
    pa: input.vpa.trim(),
    pn: input.payeeName.trim() || "Restaurant",
    am: formatUpiAmount(input.amount),
    cu: "INR",
    tn: (input.note ?? "Restaurant bill").slice(0, 80),
    tr: input.transactionRef.slice(0, 35),
  });
}

export function buildUpiIntents(input: UpiIntentInput) {
  const query = buildUpiPayQuery(input);
  return {
    generic: `upi://pay?${query}`,
    gpay: `gpay://upi/pay?${query}`,
    phonepe: `phonepe://pay?${query}`,
    paytm: `paytmmp://pay?${query}`,
    amount: formatUpiAmount(input.amount),
    vpa: input.vpa.trim(),
    payeeName: input.payeeName.trim(),
  };
}

export function publicPaymentMethods(settings: {
  upiVpa?: string | null;
  paymentQrUrl?: string | null;
  automaticUpiEnabled?: boolean;
}) {
  const manualUpi = isValidUpiVpa(settings.upiVpa) || Boolean(settings.paymentQrUrl?.trim());
  return {
    cash: true,
    manualUpi,
    automaticUpi: Boolean(settings.automaticUpiEnabled),
    upiVpa: isValidUpiVpa(settings.upiVpa) ? settings.upiVpa!.trim() : null,
  };
}
