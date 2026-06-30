import { prisma } from "@/lib/prisma";
import {
  buildReceiptPayload,
  RECEIPT_ORDER_INCLUDE,
  RECEIPT_RESTAURANT_SELECT,
} from "@/lib/receipt-service";
import { isFeatureEnabled } from "@/lib/feature-flags";

export async function buildReceiptForPaidOrder(orderId: string, restaurantId: string) {
  const thermalEnabled = await isFeatureEnabled(restaurantId, "thermal_receipts");
  if (!thermalEnabled) {
    return null;
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: RECEIPT_RESTAURANT_SELECT,
  });

  const paidOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: RECEIPT_ORDER_INCLUDE,
  });

  if (!restaurant || !paidOrder?.paidAt) {
    return null;
  }

  return buildReceiptPayload(restaurant, paidOrder);
}
