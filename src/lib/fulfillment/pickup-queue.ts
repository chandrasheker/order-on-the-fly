import { prisma } from "@/lib/prisma";
import { todayDateString } from "@/lib/utils";
import { readyAgingLevel } from "@/lib/fulfillment/constants";
import {
  evaluateCollectionEligibility,
  outstandingAmountPaiseForCollection,
} from "@/lib/fulfillment/collection";
import { evaluateSelfPickupNotifications } from "@/lib/fulfillment/notify";

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
      restaurant: { select: { receiptGstEnabled: true, receiptGstRate: true } },
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
      await evaluateSelfPickupNotifications(order.id);
    }
  }

  const now = new Date();
  const rows = orders.map((order) => {
    const eligibility = evaluateCollectionEligibility(order);
    const outstandingAmountPaise = outstandingAmountPaiseForCollection(order);
    const group = order.collectedAt
      ? "RECENTLY_COLLECTED"
      : eligibility.collectable
        ? "READY_TO_HANDOVER"
        : eligibility.foodReady
          ? "PAYMENT_REQUIRED"
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
      pickupLocationLabel: restaurant?.pickupLocationLabel ?? "Pickup Counter",
    };
  });

  return {
    pickupLocationLabel: restaurant?.pickupLocationLabel ?? "Pickup Counter",
    readyToHandover: rows.filter((row) => row.group === "READY_TO_HANDOVER"),
    paymentRequired: rows.filter((row) => row.group === "PAYMENT_REQUIRED"),
    recentlyCollected: rows
      .filter((row) => row.group === "RECENTLY_COLLECTED")
      .sort((a, b) => (b.collectedAt?.getTime() ?? 0) - (a.collectedAt?.getTime() ?? 0))
      .slice(0, 12),
    preparing: rows.filter((row) => row.group === "PREPARING"),
  };
}
