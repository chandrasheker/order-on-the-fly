import { prisma } from "@/lib/prisma";
import { createOrderForTable, OrderCreationError, type CreateOrderItemInput } from "@/lib/order-service";
import { ensureServiceTables, getServiceTableId } from "@/lib/service-tables";
import type { OrderChannel } from "@/generated/prisma/client";

type AggregatorItemInput = {
  menuItemId?: string;
  itemName?: string;
  quantity: number;
  notes?: string;
};

export async function createChannelOrder(params: {
  restaurantId: string;
  restaurantSlug: string;
  channel: OrderChannel;
  customerName?: string | null;
  customerPhone?: string | null;
  externalOrderId?: string | null;
  orderNotes?: string | null;
  items: AggregatorItemInput[];
  placedByUserId?: string | null;
  placedByName?: string | null;
}) {
  await ensureServiceTables(params.restaurantId, params.restaurantSlug);

  const tableId = await getServiceTableId(params.restaurantId, params.channel);
  if (!tableId) {
    throw new OrderCreationError("Service table not configured for this channel", 500);
  }

  const resolvedItems = await resolveItems(params.restaurantId, params.items);
  if (!resolvedItems.length) {
    throw new OrderCreationError("Order must include at least one valid item", 400);
  }

  return createOrderForTable({
    tableId,
    restaurantId: params.restaurantId,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    orderChannel: params.channel,
    externalOrderId: params.externalOrderId,
    orderNotes: params.orderNotes,
    items: resolvedItems,
    placedByUserId: params.placedByUserId,
    placedByName: params.placedByName,
  });
}

async function resolveItems(restaurantId: string, items: AggregatorItemInput[]) {
  const output: CreateOrderItemInput[] = [];

  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    if (item.menuItemId) {
      output.push({
        menuItemId: item.menuItemId,
        quantity,
        notes: item.notes,
      });
      continue;
    }

    const name = item.itemName?.trim();
    if (!name) continue;

    const menuItem = await prisma.menuItem.findFirst({
      where: {
        isAvailable: true,
        name,
        category: { restaurantId },
      },
      select: { id: true },
    });

    if (menuItem) {
      output.push({ menuItemId: menuItem.id, quantity, notes: item.notes });
    }
  }

  return output;
}

export function verifyAggregatorWebhookSecret(
  provided: string | null | undefined,
  restaurantSecret: string | null | undefined
) {
  const envSecret = process.env.TABLETAP_WEBHOOK_SECRET;
  if (provided && restaurantSecret && provided === restaurantSecret) return true;
  if (provided && envSecret && provided === envSecret) return true;
  return false;
}
