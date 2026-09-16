import { prisma } from "@/lib/prisma";
import { todayDateString } from "@/lib/utils";
import { pickupHandoverPhase, readyAgingLevel } from "@/lib/fulfillment/constants";
import {
  evaluateCollectionEligibility,
  outstandingAmountPaiseForCollection,
} from "@/lib/fulfillment/collection";
import { evaluateSelfPickupNotifications } from "@/lib/fulfillment/notify";
import { RESTAURANT_GST_SELECT } from "@/lib/order-financials";

export async function getPickupQueue(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { pickupLocationLabel: true },
  });

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      date: todayDateString(),
      fulfillmentMode: "SELF_PICKUP",
      status: { not: "CANCELLED" },
    },
    include: {
      items: true,
      payments: true,
      table: { select: { number: true } },
      restaurant: { select: RESTAURANT_GST_SELECT },
      bills: {
        where: { status: "FINALIZED" },
        select: {
          status: true,
          grandTotal: true,
          itemSubtotal: true,
          orderDiscount: true,
          gstAmount: true,
          cgstAmount: true,
          sgstAmount: true,
        },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const order of orders) {
    if (!order.collectedAt) {
      void evaluateSelfPickupNotifications(order.id);
    }
  }

  const now = new Date();
  const rows = orders.map((order) => {
    const eligibility = evaluateCollectionEligibility(order);
    const outstandingAmountPaise = outstandingAmountPaiseForCollection(order);
    const phase = pickupHandoverPhase({
      foodReady: eligibility.foodReady,
      paid: eligibility.financiallySettled,
      collected: Boolean(order.collectedAt),
    });
    const group =
      phase === "DONE"
        ? "RECENTLY_COLLECTED"
        : phase === "AWAIT_PAYMENT"
          ? "AWAITING_PAYMENT"
          : phase === "HANDOVER"
            ? "READY_TO_HANDOVER"
            : "PREPARING";
    return {
      id: order.id,
      pickupNumber: order.orderNumber,
      pickupCode: order.pickupCode,
      tableNumber: order.table.number,
      status: order.status,
      foodReady: eligibility.foodReady,
      collectable: eligibility.collectable,
      collected: Boolean(order.collectedAt),
      outstandingAmountPaise,
      paid: eligibility.financiallySettled,
      readyAt: order.readyAt,
      collectedAt: order.collectedAt,
      aging: readyAgingLevel(order.readyAt, now),
      group,
      phase,
      pickupLocationLabel: restaurant?.pickupLocationLabel ?? "Pickup Counter",
    };
  });

  const awaitingPayment = rows.filter((row) => row.group === "AWAITING_PAYMENT");
  return {
    pickupLocationLabel: restaurant?.pickupLocationLabel ?? "Pickup Counter",
    readyToHandover: rows.filter((row) => row.group === "READY_TO_HANDOVER"),
    awaitingPayment,
    paymentRequired: awaitingPayment,
    recentlyCollected: rows
      .filter((row) => row.group === "RECENTLY_COLLECTED")
      .sort((a, b) => (b.collectedAt?.getTime() ?? 0) - (a.collectedAt?.getTime() ?? 0))
      .slice(0, 12),
    preparing: rows.filter((row) => row.group === "PREPARING"),
  };
}
