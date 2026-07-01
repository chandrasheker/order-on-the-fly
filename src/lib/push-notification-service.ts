import { prisma } from "@/lib/prisma";
import { logWarn } from "@/lib/logger";
import crypto from "node:crypto";

type WebPushModule = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ): Promise<unknown>;
};

function getVapidKeys() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT ?? "mailto:admin@tabletap.app" };
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export async function savePushSubscription(params: {
  restaurantId: string;
  userId?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint: params.endpoint },
  });
  if (existing) {
    return prisma.pushSubscription.update({
      where: { endpoint: params.endpoint },
      data: {
        restaurantId: params.restaurantId,
        userId: params.userId ?? null,
        p256dh: params.p256dh,
        auth: params.auth,
      },
    });
  }
  return prisma.pushSubscription.create({ data: params });
}

export async function sendPushToRestaurant(
  restaurantId: string,
  payload: { title: string; body: string; tag?: string; urgent?: boolean },
) {
  const vapid = getVapidKeys();
  if (!vapid) return;

  let webpush: WebPushModule;
  try {
    webpush = (await import("web-push")) as WebPushModule;
  } catch {
    logWarn("push", "web-push not installed; run npm install web-push");
    return;
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const subs = await prisma.pushSubscription.findMany({ where: { restaurantId } });
  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag ?? crypto.randomUUID(),
    urgent: payload.urgent ?? false,
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          message,
        );
      } catch {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      }
    }),
  );
}
