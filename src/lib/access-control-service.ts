import { prisma } from "@/lib/prisma";

export type AccessBlockReason = "NOT_FOUND" | "RESTAURANT_DISABLED" | "TENANT_DISABLED";

export async function getRestaurantAccessState(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      isEnabled: true,
      tenantId: true,
      tenant: { select: { isEnabled: true } },
    },
  });

  if (!restaurant) {
    return { ok: false as const, reason: "NOT_FOUND" as AccessBlockReason };
  }
  if (!restaurant.isEnabled) {
    return { ok: false as const, reason: "RESTAURANT_DISABLED" as AccessBlockReason };
  }
  if (restaurant.tenant && !restaurant.tenant.isEnabled) {
    return { ok: false as const, reason: "TENANT_DISABLED" as AccessBlockReason };
  }
  return { ok: true as const, restaurantId: restaurant.id, tenantId: restaurant.tenantId };
}

export async function getRestaurantAccessBySlug(slug: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!restaurant) {
    return { ok: false as const, reason: "NOT_FOUND" as AccessBlockReason };
  }
  return getRestaurantAccessState(restaurant.id);
}

export function accessBlockMessage(reason: AccessBlockReason) {
  switch (reason) {
    case "TENANT_DISABLED":
      return "This account is temporarily unavailable. Please contact support.";
    case "RESTAURANT_DISABLED":
      return "This restaurant is temporarily unavailable. Please contact support.";
    default:
      return "Not found";
  }
}
