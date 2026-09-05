import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logApiError, logApiRequest, logWarn } from "@/lib/logger";
import { isTablePaymentBlocked } from "@/lib/payment-service";
import { getPaymentQrPublicUrl, paymentQrExists } from "@/lib/payment-qr-storage";
import { getCustomerBackgroundImageUrl } from "@/lib/branding-service";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { listActivePromotions, listComboMeals } from "@/lib/promotion-service";
import { getKitchenCapacityState } from "@/lib/kitchen-capacity-service";
import { resolveTenantFromHost } from "@/platform/host-tenant";
import { assertPathSlugForResolution, opaqueNotFoundJson } from "@/platform/tenant-scope";
import { isRazorpayAutomaticReady } from "@/lib/automatic-gateway";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string }> }
) {
  const { slug, token } = await params;
  logApiRequest("menu/[slug]/[token]", "GET", { slug, tableToken: "[present]" });

  try {
    const host = await resolveTenantFromHost(req);
    if (!host.ok) return opaqueNotFoundJson();
    if (!assertPathSlugForResolution(slug, host)) {
      return opaqueNotFoundJson();
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        rewardThresholdTea: true,
        rewardThresholdBeverage: true,
        rewardTeaLabel: true,
        rewardBeverageLabel: true,
        backgroundImageUrl: true,
        paymentQrUrl: true,
        upiVpa: true,
        upiMerchantName: true,
        paymentGatewayProvider: true,
        paymentGatewayKeyId: true,
        paymentGatewaySecretEnc: true,
        paymentWebhookSecret: true,
        paymentWebhookSecretEnc: true,
      },
    });

    if (!restaurant) {
      logWarn("menu/[slug]/[token]", "Restaurant not found", { slug });
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const { getRestaurantAccessState, accessBlockMessage } = await import(
      "@/lib/access-control-service"
    );
    const access = await getRestaurantAccessState(restaurant.id);
    if (!access.ok) {
      return NextResponse.json(
        { error: accessBlockMessage(access.reason), code: access.reason },
        { status: 403 },
      );
    }

    const table = await prisma.table.findFirst({
      where: { qrToken: token, restaurantId: restaurant.id, isActive: true },
    });

    if (!table) {
      logWarn("menu/[slug]/[token]", "Table not found", { slug });
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const [
      categories,
      promotionsOn,
      modifiersOn,
      callWaiterOn,
      kitchenOn,
      promotions,
      combos,
      kitchenState,
      modifierLinks,
    ] = await Promise.all([
    prisma.menuCategory.findMany({
      where: { restaurantId: restaurant.id, isEnabled: true },
      include: {
        items: {
          where: { isAvailable: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
      isFeatureEnabled(restaurant.id, "promotions_engine"),
      isFeatureEnabled(restaurant.id, "menu_modifiers"),
      isFeatureEnabled(restaurant.id, "call_waiter"),
      isFeatureEnabled(restaurant.id, "kitchen_capacity"),
      isFeatureEnabled(restaurant.id, "promotions_engine").then((on) =>
        on ? listActivePromotions(restaurant.id) : [],
      ),
      isFeatureEnabled(restaurant.id, "promotions_engine").then((on) =>
        on ? listComboMeals(restaurant.id) : [],
      ),
      isFeatureEnabled(restaurant.id, "kitchen_capacity").then((on) =>
        on ? getKitchenCapacityState(restaurant.id) : { paused: false, message: null, overdueCount: 0 },
      ),
      isFeatureEnabled(restaurant.id, "menu_modifiers").then((on) =>
        on
          ? prisma.menuItemModifierGroup.findMany({
              where: { menuItem: { category: { restaurantId: restaurant.id } } },
              include: {
                modifierGroup: {
                  include: { options: { orderBy: { sortOrder: "asc" } } },
                },
              },
            })
          : [],
      ),
    ]);

    const modifiersByItem = new Map<string, Array<(typeof modifierLinks)[number]["modifierGroup"]>>();
    if (modifiersOn) {
      for (const link of modifierLinks) {
        const list = modifiersByItem.get(link.menuItemId) ?? [];
        list.push(link.modifierGroup);
        modifiersByItem.set(link.menuItemId, list);
      }
    }

    const enrichedCategories = categories.map((cat) => ({
      ...cat,
      items: cat.items.map((item) => ({
        ...item,
        modifierGroups: modifiersByItem.get(item.id) ?? [],
      })),
    }));

    const paymentBlocked = await isTablePaymentBlocked(table.id);
    const hasPaymentQr = await paymentQrExists(restaurant.id);
    const paymentQrUrl = hasPaymentQr ? getPaymentQrPublicUrl(restaurant.slug) : null;
    const backgroundImageUrl = await getCustomerBackgroundImageUrl(restaurant);

    return NextResponse.json({
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        rewardThresholdTea: restaurant.rewardThresholdTea,
        rewardThresholdBeverage: restaurant.rewardThresholdBeverage,
        rewardTeaLabel: restaurant.rewardTeaLabel,
        rewardBeverageLabel: restaurant.rewardBeverageLabel,
        backgroundImageUrl,
        paymentQrUrl,
        upiVpa: restaurant.upiVpa ?? null,
        upiMerchantName: restaurant.upiMerchantName ?? restaurant.name,
        automaticUpiEnabled: isRazorpayAutomaticReady(restaurant),
      },
      table: { id: table.id, number: table.number, qrToken: table.qrToken },
      paymentBlocked,
      features: {
        promotions: promotionsOn,
        modifiers: modifiersOn,
        callWaiter: callWaiterOn,
        kitchenCapacity: kitchenOn,
      },
      kitchenPaused: kitchenOn ? kitchenState.paused : false,
      kitchenPauseMessage: kitchenOn ? kitchenState.message : null,
      promotions: promotionsOn
        ? promotions.map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            value: p.value,
            code: p.code,
            categorySlug: p.categorySlug,
            minOrderAmount: p.minOrderAmount,
          }))
        : [],
      combos: promotionsOn ? combos : [],
      categories: enrichedCategories.filter((c) => c.items.length > 0),
    });
  } catch (error) {
    logApiError("menu/[slug]/[token]", "GET", error, { slug });
    return NextResponse.json({ error: "Failed to load menu" }, { status: 500 });
  }
}

export const GET = withForensicApiRoute(handleGET);
