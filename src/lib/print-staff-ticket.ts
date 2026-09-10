import type { KitchenChitPayload } from "@/lib/kitchen-chit-service";

export function printStaffTicketHtml(chit: KitchenChitPayload) {
  const items = chit.items
    .map((item) => `${item.quantity}× ${item.name}${item.notes ? ` (${item.notes})` : ""}`)
    .join("<br/>");
  const html = `<!doctype html>
<html>
  <head>
    <title>Order #${chit.orderNumber}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 16px; max-width: 280px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { margin: 4px 0; font-size: 13px; }
      hr { border: none; border-top: 1px dashed #999; margin: 10px 0; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(chit.restaurantName)}</h1>
    <p><strong>Order #${chit.orderNumber}</strong></p>
    <p>${escapeHtml(chit.locationLabel)}</p>
    ${chit.fulfillmentMode === "SELF_PICKUP" ? `<p>Self pickup${chit.pickupNumber ? ` · #${chit.pickupNumber}` : ""}</p>` : ""}
    ${chit.customerName ? `<p>Guest: ${escapeHtml(chit.customerName)}</p>` : ""}
    <hr/>
    <p>${items}</p>
  </body>
</html>`;

  const popup = window.open("", "_blank", "noopener,noreferrer,width=380,height=640");
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
