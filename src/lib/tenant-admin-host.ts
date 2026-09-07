import { prisma } from "@/lib/prisma";
import type { HostTenantResolution } from "@/platform/host-tenant";

export type TenantAdminHostContext = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  hostKind: "tenant" | "restaurant";
};

/**
 * Authoritative TenantAdmin host gate.
 *
 * Dedicated tenant hub (`kind == tenant`) is always the tenant-wide surface.
 * A restaurant host is allowed only while that tenant currently has exactly
 * one restaurant, and that restaurant belongs to the resolved tenant.
 *
 * Tenant identity is taken from hostname/DB state, never from browser input.
 */
export async function resolveTenantAdminHostContext(
  resolution: HostTenantResolution,
): Promise<TenantAdminHostContext | null> {
  if (!resolution.ok) return null;

  if (resolution.kind === "tenant") {
    return {
      tenantId: resolution.tenant.tenantId,
      tenantName: resolution.tenant.tenantName,
      tenantSlug: resolution.tenant.tenantSlug,
      hostKind: "tenant",
    };
  }

  if (resolution.kind !== "restaurant") return null;

  const tenantId = resolution.context.tenantId;
  const restaurantId = resolution.context.restaurantId;
  if (!tenantId || !restaurantId) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      isEnabled: true,
      restaurants: { select: { id: true } },
    },
  });
  if (!tenant?.isEnabled) return null;
  if (tenant.restaurants.length !== 1) return null;
  if (tenant.restaurants[0].id !== restaurantId) return null;

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    hostKind: "restaurant",
  };
}
