import { prisma } from "@/lib/prisma";
import type { SubscriptionStatus, TenantPlan } from "@/generated/prisma/client";
import { invalidateFeatureCache } from "@/lib/feature-flags";
import {
  buildFeatureOverrides,
  modeForPlan,
  serializeFeatureOverrides,
} from "@/lib/plan-features";
import { updateTenantSubscription } from "@/lib/tenant-service";

const DEMO_DAYS = 7;

export type TenantBillingState = {
  demoPackUsedAt: string | null;
  demoExpiresAt: string | null;
  isDemoActive: boolean;
  canEnableDemo: boolean;
  canSelectPlan: boolean;
  billingLockedReason: string | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function serializeTenantBilling(
  tenant: NonNullable<Awaited<ReturnType<typeof expireDemoIfNeeded>>>,
) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    plan: tenant.plan,
    subscriptionStatus: tenant.subscriptionStatus,
    billingEmail: tenant.billingEmail,
    demoPackUsedAt: toIso(tenant.demoPackUsedAt),
    demoExpiresAt: toIso(tenant.demoExpiresAt),
    restaurants: tenant.restaurants.map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
    })),
    subscriptions: tenant.subscriptions.map((subscription) => ({
      id: subscription.id,
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodEnd: toIso(subscription.currentPeriodEnd),
      createdAt: toIso(subscription.createdAt) ?? new Date(0).toISOString(),
    })),
    billing: resolveBillingState(tenant),
  };
}

async function restaurantIdsForTenant(tenantId: string) {
  const rows = await prisma.restaurant.findMany({
    where: { tenantId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function applyFeatureModeToTenant(
  tenantId: string,
  mode: "expired" | "starter" | "pro" | "enterprise" | "demo",
) {
  const overrides = buildFeatureOverrides(mode);
  const payload = serializeFeatureOverrides(overrides);
  const ids = await restaurantIdsForTenant(tenantId);
  if (ids.length === 0) return;

  await prisma.restaurant.updateMany({
    where: { id: { in: ids } },
    data: { featureFlags: payload },
  });

  for (const id of ids) {
    invalidateFeatureCache(id);
  }
}

export async function expireDemoIfNeeded(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      subscriptionStatus: true,
      demoExpiresAt: true,
    },
  });
  if (!tenant) return null;

  if (
    tenant.subscriptionStatus === "DEMO" &&
    tenant.demoExpiresAt &&
    tenant.demoExpiresAt.getTime() <= Date.now()
  ) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { subscriptionStatus: "EXPIRED" },
    });

    await prisma.tenantSubscription.create({
      data: {
        tenantId,
        plan: "STARTER",
        status: "EXPIRED",
        currentPeriodEnd: tenant.demoExpiresAt,
        metadata: JSON.stringify({ type: "demo_expired" }),
      },
    });

    await applyFeatureModeToTenant(tenantId, "expired");
  }

  return prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      subscriptions: { orderBy: { createdAt: "desc" }, take: 24 },
      restaurants: { select: { id: true, name: true, slug: true } },
    },
  });
}

export function resolveBillingState(tenant: {
  demoPackUsedAt: Date | null;
  demoExpiresAt: Date | null;
  subscriptionStatus: SubscriptionStatus;
}): TenantBillingState {
  const now = Date.now();
  const isDemoActive =
    tenant.subscriptionStatus === "DEMO" &&
    tenant.demoExpiresAt != null &&
    tenant.demoExpiresAt.getTime() > now;

  const canEnableDemo = tenant.demoPackUsedAt == null;

  const canSelectPlan =
    !isDemoActive &&
    (tenant.subscriptionStatus === "EXPIRED" ||
      tenant.subscriptionStatus === "ACTIVE" ||
      tenant.subscriptionStatus === "PAST_DUE" ||
      tenant.subscriptionStatus === "CANCELLED" ||
      tenant.demoPackUsedAt != null);

  let billingLockedReason: string | null = null;
  if (isDemoActive && tenant.demoExpiresAt) {
    billingLockedReason = `Demo pack active until ${tenant.demoExpiresAt.toLocaleDateString()}. Plan changes unlock after demo ends.`;
  }

  return {
    demoPackUsedAt: tenant.demoPackUsedAt?.toISOString() ?? null,
    demoExpiresAt: tenant.demoExpiresAt?.toISOString() ?? null,
    isDemoActive,
    canEnableDemo,
    canSelectPlan,
    billingLockedReason,
  };
}

export async function activateDemoPack(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, demoPackUsedAt: true },
  });
  if (!tenant) throw new Error("Tenant not found");
  if (tenant.demoPackUsedAt) {
    throw new Error("Demo pack was already used for this tenant and cannot be enabled again.");
  }

  const expiresAt = new Date(Date.now() + DEMO_DAYS * 86400000);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      demoPackUsedAt: new Date(),
      demoExpiresAt: expiresAt,
      subscriptionStatus: "DEMO",
      plan: "PRO",
    },
  });

  await prisma.tenantSubscription.create({
    data: {
      tenantId,
      plan: "PRO",
      status: "DEMO",
      currentPeriodEnd: expiresAt,
      metadata: JSON.stringify({ type: "demo_pack", days: DEMO_DAYS }),
    },
  });

  await applyFeatureModeToTenant(tenantId, "demo");

  return expireDemoIfNeeded(tenantId);
}

export async function setTenantPaidPlan(tenantId: string, plan: TenantPlan) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      subscriptionStatus: true,
      demoExpiresAt: true,
    },
  });
  if (!tenant) throw new Error("Tenant not found");

  const now = Date.now();
  if (
    tenant.subscriptionStatus === "DEMO" &&
    tenant.demoExpiresAt &&
    tenant.demoExpiresAt.getTime() > now
  ) {
    throw new Error("Cannot change plan while the 7-day demo pack is still active.");
  }

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await updateTenantSubscription(tenantId, {
    plan,
    status: "ACTIVE",
    currentPeriodEnd: periodEnd,
  });

  await applyFeatureModeToTenant(tenantId, modeForPlan(plan));

  return expireDemoIfNeeded(tenantId);
}
