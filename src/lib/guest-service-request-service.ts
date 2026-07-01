import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import type { GuestServiceType } from "@/generated/prisma/client";
import { dispatchRealtimeNotifications } from "@/lib/outbound-notification-service";

export async function createGuestServiceRequest(params: {
  restaurantId: string;
  tableId: string;
  sessionKey?: string;
  type: GuestServiceType;
  message?: string;
}) {
  if (!(await isFeatureEnabled(params.restaurantId, "call_waiter"))) {
    throw new Error("Call waiter not enabled");
  }

  const table = await prisma.table.findFirst({
    where: { id: params.tableId, restaurantId: params.restaurantId },
  });
  if (!table) throw new Error("Table not found");

  const pending = await prisma.guestServiceRequest.findFirst({
    where: {
      restaurantId: params.restaurantId,
      tableId: params.tableId,
      type: params.type,
      status: "PENDING",
    },
  });
  if (pending) return pending;

  const row = await prisma.guestServiceRequest.create({
    data: {
      restaurantId: params.restaurantId,
      tableId: params.tableId,
      sessionKey: params.sessionKey ?? null,
      type: params.type,
      message: params.message?.trim() || null,
    },
    include: { table: { select: { number: true } } },
  });

  const label =
    params.type === "CALL_WAITER"
      ? "Call waiter"
      : params.type === "REQUEST_BILL"
        ? "Request bill"
        : params.type === "WATER"
          ? "Water refill"
          : params.type === "REFILL"
            ? "Refill"
            : "Guest request";

  await prisma.alert.create({
    data: {
      type: "ALARM",
      message: `${label}${params.message ? `: ${params.message}` : ""}`,
      tableNumber: row.table.number,
      restaurantId: params.restaurantId,
    },
  });

  void dispatchRealtimeNotifications({
    restaurantId: params.restaurantId,
    type: "GUEST_SERVICE",
    title: `${label} — Table ${row.table.number}`,
    body: params.message ?? "Guest needs assistance",
    tableNumber: row.table.number,
    urgent: true,
  });

  return row;
}

export async function listPendingGuestRequests(restaurantId: string) {
  return prisma.guestServiceRequest.findMany({
    where: { restaurantId, status: { in: ["PENDING", "ACKNOWLEDGED"] } },
    include: { table: { select: { number: true } } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
}

export async function updateGuestServiceRequest(params: {
  restaurantId: string;
  id: string;
  status: "ACKNOWLEDGED" | "RESOLVED";
  userId?: string;
  userName?: string;
}) {
  const row = await prisma.guestServiceRequest.findFirst({
    where: { id: params.id, restaurantId: params.restaurantId },
  });
  if (!row) throw new Error("Request not found");

  return prisma.guestServiceRequest.update({
    where: { id: params.id },
    data: {
      status: params.status,
      acknowledgedByUserId: params.userId ?? row.acknowledgedByUserId,
      acknowledgedByName: params.userName ?? row.acknowledgedByName,
      acknowledgedAt:
        params.status === "ACKNOWLEDGED" && !row.acknowledgedAt
          ? new Date()
          : row.acknowledgedAt,
      resolvedAt: params.status === "RESOLVED" ? new Date() : row.resolvedAt,
    },
  });
}
