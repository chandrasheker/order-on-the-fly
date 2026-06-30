import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import type { ReservationStatus } from "@/generated/prisma/client";
import { logInfo, logWarn } from "@/lib/logger";

export async function listReservations(restaurantId: string, status?: ReservationStatus) {
  return prisma.reservation.findMany({
    where: { restaurantId, ...(status ? { status } : {}) },
    include: { table: { select: { id: true, number: true } } },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
  });
}

export async function createReservation(params: {
  restaurantId: string;
  guestName: string;
  guestPhone: string;
  partySize?: number;
  scheduledAt?: Date | null;
  notes?: string;
  status?: ReservationStatus;
}) {
  if (!(await isFeatureEnabled(params.restaurantId, "reservations"))) {
    throw new Error("Reservations not enabled");
  }

  return prisma.reservation.create({
    data: {
      restaurantId: params.restaurantId,
      guestName: params.guestName.trim(),
      guestPhone: params.guestPhone.trim(),
      partySize: params.partySize ?? 2,
      scheduledAt: params.scheduledAt ?? null,
      notes: params.notes?.trim() || null,
      status: params.status ?? "WAITLIST",
    },
  });
}

export async function updateReservationStatus(params: {
  restaurantId: string;
  id: string;
  status: ReservationStatus;
  tableId?: string | null;
}) {
  const row = await prisma.reservation.findFirst({
    where: { id: params.id, restaurantId: params.restaurantId },
  });
  if (!row) throw new Error("Reservation not found");

  return prisma.reservation.update({
    where: { id: params.id },
    data: {
      status: params.status,
      tableId: params.tableId !== undefined ? params.tableId : row.tableId,
      seatedAt: params.status === "SEATED" ? new Date() : row.seatedAt,
    },
    include: { table: { select: { number: true } } },
  });
}

export async function notifyReservationReady(restaurantId: string, reservationId: string) {
  const reservation = await prisma.reservation.findFirst({
    where: { id: reservationId, restaurantId },
    include: { restaurant: { select: { name: true, slug: true } } },
  });
  if (!reservation) throw new Error("Reservation not found");

  const message = `Hi ${reservation.guestName}, your table at ${reservation.restaurant.name} is ready! Party of ${reservation.partySize}.`;

  const webhook = process.env.SMS_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: reservation.guestPhone,
          message,
          restaurantSlug: reservation.restaurant.slug,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      logInfo("reservations:sms", "Notification sent", { reservationId });
    } catch (error) {
      logWarn("reservations:sms", "SMS webhook failed", {
        reservationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    logInfo("reservations:sms", "SMS stub (set SMS_WEBHOOK_URL)", {
      reservationId,
      phone: reservation.guestPhone,
      message,
    });
  }

  return prisma.reservation.update({
    where: { id: reservationId },
    data: { status: "NOTIFIED", notifiedAt: new Date() },
  });
}
