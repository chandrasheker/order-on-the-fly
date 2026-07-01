import type { EventSubscriber } from "@/platform/event-bus";
import { subscribe } from "@/platform/event-bus";
import { enqueuePrintJob } from "@/domains/printing/print-job-service";

const printSubscriber: EventSubscriber = async (event) => {
  if (event.type !== "ORDER_CREATED") return;
  const orderId = event.entityId;
  if (!orderId) return;

  await enqueuePrintJob({
    restaurantId: event.restaurantId,
    tenantId: event.tenantId,
    branchId: event.branchId,
    orderId,
    kind: "kitchen_chit",
    payload: {
      orderId,
      orderNumber: event.payload?.orderNumber,
      tableNumber: event.payload?.tableNumber,
    },
  });
};

subscribe("ORDER_CREATED", printSubscriber);
