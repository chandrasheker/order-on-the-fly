import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import type { PromotionType } from "@/generated/prisma/client";

export type CartLineForPromo = {
  menuItemId: string;
  categorySlug: string;
  quantity: number;
  lineTotal: number;
};

function parseDays(daysOfWeek: string | null | undefined) {
  if (!daysOfWeek?.trim()) return null;
  try {
    const arr = JSON.parse(daysOfWeek) as number[];
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function promotionActiveNow(promo: {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  daysOfWeek: string | null;
  startHour: number | null;
  endHour: number | null;
}) {
  if (!promo.isActive) return false;
  const now = new Date();
  if (promo.startsAt && now < promo.startsAt) return false;
  if (promo.endsAt && now > promo.endsAt) return false;

  const days = parseDays(promo.daysOfWeek);
  if (days && !days.includes(now.getDay())) return false;

  const hour = now.getHours();
  if (promo.startHour != null && hour < promo.startHour) return false;
  if (promo.endHour != null && hour >= promo.endHour) return false;

  return true;
}

export async function listPromotions(restaurantId: string) {
  return prisma.promotion.findMany({
    where: { restaurantId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });
}

export async function listActivePromotions(restaurantId: string) {
  const rows = await listPromotions(restaurantId);
  return rows.filter(promotionActiveNow);
}

export async function upsertPromotion(
  restaurantId: string,
  data: {
    id?: string;
    name: string;
    type: PromotionType;
    value: number;
    code?: string | null;
    categorySlug?: string | null;
    menuItemId?: string | null;
    comboMealId?: string | null;
    minOrderAmount?: number;
    startsAt?: Date | null;
    endsAt?: Date | null;
    daysOfWeek?: number[] | null;
    startHour?: number | null;
    endHour?: number | null;
    isActive?: boolean;
  },
) {
  if (!(await isFeatureEnabled(restaurantId, "promotions_engine"))) {
    throw new Error("Promotions not enabled");
  }

  if (data.code?.trim()) {
    const dup = await prisma.promotion.findFirst({
      where: {
        restaurantId,
        code: data.code.trim().toUpperCase(),
        ...(data.id ? { NOT: { id: data.id } } : {}),
      },
    });
    if (dup) throw new Error("Promo code already exists");
  }

  const payload = {
    name: data.name.trim(),
    type: data.type,
    value: data.value,
    code: data.code?.trim().toUpperCase() || null,
    categorySlug: data.categorySlug ?? null,
    menuItemId: data.menuItemId ?? null,
    comboMealId: data.comboMealId ?? null,
    minOrderAmount: data.minOrderAmount ?? 0,
    startsAt: data.startsAt ?? null,
    endsAt: data.endsAt ?? null,
    daysOfWeek: data.daysOfWeek ? JSON.stringify(data.daysOfWeek) : null,
    startHour: data.startHour ?? null,
    endHour: data.endHour ?? null,
    isActive: data.isActive ?? true,
  };

  if (data.id) {
    return prisma.promotion.update({ where: { id: data.id }, data: payload });
  }
  return prisma.promotion.create({ data: { ...payload, restaurantId } });
}

export function computePromotionDiscount(
  promo: {
    type: PromotionType;
    value: number;
    categorySlug: string | null;
    menuItemId: string | null;
    minOrderAmount: number;
  },
  lines: CartLineForPromo[],
) {
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  if (subtotal < promo.minOrderAmount) return 0;

  switch (promo.type) {
    case "PERCENT":
      return Math.min(subtotal, (subtotal * promo.value) / 100);
    case "FIXED":
      return Math.min(subtotal, promo.value);
    case "CATEGORY_PERCENT": {
      if (!promo.categorySlug) return 0;
      const catTotal = lines
        .filter((l) => l.categorySlug === promo.categorySlug)
        .reduce((s, l) => s + l.lineTotal, 0);
      return Math.min(subtotal, (catTotal * promo.value) / 100);
    }
    case "BOGO": {
      if (!promo.menuItemId) return 0;
      const target = lines.find((l) => l.menuItemId === promo.menuItemId);
      if (!target || target.quantity < 2) return 0;
      const unit = target.lineTotal / target.quantity;
      return unit * Math.floor(target.quantity / 2);
    }
    default:
      return 0;
  }
}

export async function resolvePromotionForOrder(params: {
  restaurantId: string;
  promoCode?: string | null;
  lines: CartLineForPromo[];
}) {
  if (!(await isFeatureEnabled(params.restaurantId, "promotions_engine"))) {
    return { promo: null, discount: 0 };
  }

  const active = await listActivePromotions(params.restaurantId);
  let promo = null as (typeof active)[number] | null;

  if (params.promoCode?.trim()) {
    promo =
      active.find((p) => p.code?.toUpperCase() === params.promoCode!.trim().toUpperCase()) ??
      null;
    if (!promo) throw new Error("Invalid or expired promo code");
  } else {
    promo = active.find((p) => !p.code) ?? null;
  }

  if (!promo) return { promo: null, discount: 0 };

  const discount = computePromotionDiscount(promo, params.lines);
  return { promo, discount };
}

export async function listComboMeals(restaurantId: string) {
  return prisma.comboMeal.findMany({
    where: { restaurantId, isAvailable: true },
    include: {
      items: { include: { menuItem: { select: { id: true, name: true, price: true, isAvailable: true } } } },
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function upsertComboMeal(
  restaurantId: string,
  data: {
    id?: string;
    name: string;
    description?: string | null;
    comboPrice: number;
    isAvailable?: boolean;
    items: Array<{ menuItemId: string; quantity: number }>;
  },
) {
  if (!(await isFeatureEnabled(restaurantId, "promotions_engine"))) {
    throw new Error("Promotions not enabled");
  }

  if (data.id) {
    await prisma.comboMealItem.deleteMany({ where: { comboMealId: data.id } });
    return prisma.comboMeal.update({
      where: { id: data.id },
      data: {
        name: data.name.trim(),
        description: data.description ?? null,
        comboPrice: data.comboPrice,
        isAvailable: data.isAvailable ?? true,
        items: {
          create: data.items.map((i) => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
          })),
        },
      },
      include: { items: true },
    });
  }

  return prisma.comboMeal.create({
    data: {
      restaurantId,
      name: data.name.trim(),
      description: data.description ?? null,
      comboPrice: data.comboPrice,
      isAvailable: data.isAvailable ?? true,
      items: {
        create: data.items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
        })),
      },
    },
    include: { items: true },
  });
}
