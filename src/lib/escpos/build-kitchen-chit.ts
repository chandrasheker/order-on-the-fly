import type { KitchenChitPayload } from "@/lib/kitchen-chit-service";
import { EscPosEncoder, wrapText } from "@/lib/escpos/encoder";

const LINE_WIDTH = 32;

export function buildEscPosKitchenChit(chit: KitchenChitPayload) {
  const encoder = new EscPosEncoder().init();

  encoder
    .align("center")
    .bold(true)
    .size(2, 2)
    .line("KITCHEN")
    .bold(false)
    .size(1, 1)
    .line(chit.restaurantName)
    .line("--------------------------------")
    .align("left")
    .bold(true)
    .line(`#${chit.orderNumber} · ${chit.locationLabel}`)
    .bold(false);

  if (chit.externalOrderId) {
    encoder.line(`Ref: ${chit.externalOrderId.slice(0, LINE_WIDTH)}`);
  }

  encoder.line(`Time: ${formatChitTime(chit.createdAt)}`);

  if (chit.customerName) {
    encoder.line(`Guest: ${chit.customerName}`);
  }
  if (chit.customerPhone) {
    encoder.line(`Phone: ${chit.customerPhone}`);
  }
  if (chit.placedByName) {
    encoder.line(`By: ${chit.placedByName}`);
  }

  if (chit.orderNotes) {
    encoder.line("NOTE:");
    for (const line of wrapText(chit.orderNotes, LINE_WIDTH)) {
      encoder.line(line);
    }
  }

  encoder.line("--------------------------------");

  for (const item of chit.items) {
    encoder.bold(true).line(`${item.quantity}x ${item.name}`.slice(0, LINE_WIDTH)).bold(false);
    if (item.notes) {
      for (const line of wrapText(`>> ${item.notes}`, LINE_WIDTH)) {
        encoder.line(line);
      }
    }
    encoder.line(item.categoryName.slice(0, LINE_WIDTH));
  }

  encoder.line("--------------------------------").feed(3).cut(true);
  return encoder.build();
}

function formatChitTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}
