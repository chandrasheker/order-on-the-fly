import type { EventSubscriber } from "@/platform/event-bus";
import { subscribe } from "@/platform/event-bus";
import { dispatchRealtimeNotifications } from "@/lib/outbound-notification-service";
import { formatCurrency } from "@/lib/utils";

const notificationSubscriber: EventSubscriber = async (event) => {
  if (event.type === "ORDER_CREATED") {
    const orderNumber = Number(event.payload?.orderNumber ?? 0);
    const total = Number(event.payload?.total ?? 0);
    const tableNumber = Number(event.payload?.tableNumber ?? 0);
    await dispatchRealtimeNotifications({
      restaurantId: event.restaurantId,
      type: "NEW_ORDER",
      title: `New order #${orderNumber}`,
      body: `Table ${tableNumber} — ${formatCurrency(total)}`,
      tableNumber,
      urgent: true,
    });
  }

  if (event.type === "ORDER_UPDATED" && event.payload?.event === "ORDER_READY") {
    const orderNumber = Number(event.payload?.orderNumber ?? 0);
    const tableNumber = Number(event.payload?.tableNumber ?? 0);
    await dispatchRealtimeNotifications({
      restaurantId: event.restaurantId,
      type: "ORDER_READY",
      title: `Order #${orderNumber} ready`,
      body: `Table ${tableNumber} — ready to serve`,
      tableNumber,
    });
  }

  if (event.type === "ORDER_PAID") {
    await dispatchRealtimeNotifications({
      restaurantId: event.restaurantId,
      type: "PAYMENT_RECEIVED",
      title: "Payment received",
      body: formatCurrency(Number(event.payload?.amount ?? 0)),
      urgent: false,
    });
  }
};

subscribe("ORDER_CREATED", notificationSubscriber);
subscribe("ORDER_UPDATED", notificationSubscriber);
subscribe("ORDER_PAID", notificationSubscriber);
