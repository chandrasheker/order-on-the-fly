export function auditMenuItemSnapshot(item: {
  id: string;
  name?: string | null;
  price?: number | null;
  isAvailable?: boolean | null;
  categoryId?: string | null;
  prepTimeMinutes?: number | null;
}) {
  return {
    id: item.id,
    name: item.name ?? null,
    price: item.price ?? null,
    isAvailable: item.isAvailable ?? null,
    categoryId: item.categoryId ?? null,
    prepTimeMinutes: item.prepTimeMinutes ?? null,
  };
}

export function auditMenuCategorySnapshot(category: {
  id: string;
  name?: string | null;
  slug?: string | null;
  isEnabled?: boolean | null;
}) {
  return {
    id: category.id,
    name: category.name ?? null,
    slug: category.slug ?? null,
    isEnabled: category.isEnabled ?? null,
  };
}

export function auditStaffSnapshot(user: {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  restaurantId?: string | null;
}) {
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    role: user.role ?? null,
    restaurantId: user.restaurantId ?? null,
  };
}

export function auditOrderSnapshot(order: {
  id: string;
  status?: string | null;
  tableId?: string | null;
  discountAmount?: number | null;
  promoCode?: string | null;
  orderNumber?: number | null;
}) {
  return {
    id: order.id,
    status: order.status ?? null,
    tableId: order.tableId ?? null,
    discountAmount: order.discountAmount ?? null,
    promoCode: order.promoCode ?? null,
    orderNumber: order.orderNumber ?? null,
  };
}

export function auditPaymentSnapshot(payment: {
  id: string;
  status?: string | null;
  method?: string | null;
  amount?: number | null;
  provider?: string | null;
  providerPaymentId?: string | null;
  billId?: string | null;
  orderId?: string | null;
  refundOfPaymentId?: string | null;
}) {
  return {
    id: payment.id,
    status: payment.status ?? null,
    method: payment.method ?? null,
    amountPaise: payment.amount == null ? null : Math.round(Number(payment.amount) * 100),
    currency: "INR",
    provider: payment.provider ?? null,
    providerPaymentId: payment.providerPaymentId ?? null,
    billId: payment.billId ?? null,
    orderId: payment.orderId ?? null,
    refundOfPaymentId: payment.refundOfPaymentId ?? null,
  };
}

export function auditRestaurantConfigSnapshot(row: {
  receiptGstEnabled?: boolean | null;
  receiptGstRate?: number | null;
  receiptAddress?: string | null;
  receiptPhone?: string | null;
  receiptGstin?: string | null;
  receiptFooter?: string | null;
  isEnabled?: boolean | null;
}) {
  return {
    gstEnabled: row.receiptGstEnabled ?? null,
    gstRate: row.receiptGstRate ?? null,
    receiptAddress: row.receiptAddress ?? null,
    receiptPhone: row.receiptPhone ?? null,
    receiptGstin: row.receiptGstin ?? null,
    receiptFooter: row.receiptFooter ?? null,
    isEnabled: row.isEnabled ?? null,
  };
}

export function auditGatewaySettingsSnapshot(row: {
  provider?: string | null;
  keyId?: string | null;
  secretPresent?: boolean;
  webhookSecretPresent?: boolean;
  automaticAvailable?: boolean | null;
}) {
  return {
    provider: row.provider ?? null,
    keyId: row.keyId ?? null,
    secretPresent: Boolean(row.secretPresent),
    webhookSecretPresent: Boolean(row.webhookSecretPresent),
    automaticAvailable: row.automaticAvailable ?? null,
  };
}

export function auditPrinterAgentSnapshot(agent: {
  id: string;
  name?: string | null;
  branchId?: string | null;
  enabled?: boolean | null;
  revokedAt?: Date | string | null;
  allowedTargets?: string[] | null;
}) {
  return {
    id: agent.id,
    name: agent.name ?? null,
    branchId: agent.branchId ?? null,
    enabled: agent.enabled ?? null,
    revoked: Boolean(agent.revokedAt),
    allowedTargets: agent.allowedTargets ?? null,
  };
}

export function auditPrintJobSnapshot(job: {
  id: string;
  kind?: string | null;
  target?: string | null;
  status?: string | null;
  attempts?: number | null;
  lastErrorCode?: string | null;
  claimedByAgentId?: string | null;
  reprintOfPrintJobId?: string | null;
}) {
  return {
    id: job.id,
    kind: job.kind ?? null,
    target: job.target ?? null,
    status: job.status ?? null,
    attempt: job.attempts ?? null,
    errorCode: job.lastErrorCode ?? null,
    claimedByAgentId: job.claimedByAgentId ?? null,
    reprintOfPrintJobId: job.reprintOfPrintJobId ?? null,
  };
}

export function amountPaiseFromNumber(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}
