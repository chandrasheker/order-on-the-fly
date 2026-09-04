function line(text = "") {
  return `${String(text)}\n`;
}

export function renderKitchenChit(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  let out = "";
  out += line("KITCHEN TICKET");
  out += line(`Order #${payload.orderNumber ?? ""}  Table ${payload.tableNumber ?? ""}`);
  if (payload.createdAt) out += line(String(payload.createdAt));
  out += line("----------------");
  for (const item of items) {
    out += line(`${item.quantity ?? 1} x ${item.name ?? "Item"}`);
    if (item.notes) out += line(`  ${item.notes}`);
  }
  out += line("----------------");
  return out;
}

export function renderCustomerBill(payload = {}) {
  const restaurant = payload.restaurant ?? {};
  const order = payload.order ?? {};
  const financials = payload.financials ?? {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  let out = "";
  out += line(restaurant.name ?? "Receipt");
  if (restaurant.address) out += line(restaurant.address);
  if (restaurant.phone) out += line(restaurant.phone);
  if (restaurant.gstin) out += line(`GSTIN ${restaurant.gstin}`);
  if (payload.branch?.name) out += line(payload.branch.name);
  out += line("----------------");
  out += line(`Bill ${payload.billNumber ?? order.billNumber ?? ""}`);
  out += line(`Table ${order.tableNumber ?? ""}  Order #${order.orderNumber ?? ""}`);
  if (payload.finalizedAt) out += line(String(payload.finalizedAt));
  out += line("----------------");
  for (const item of items) {
    out += line(`${item.quantity ?? 1} x ${item.name ?? "Item"}  ${item.lineTotal ?? ""}`);
  }
  out += line("----------------");
  out += line(`Subtotal  ${financials.taxableSubtotal ?? financials.itemSubtotal ?? ""}`);
  if (financials.orderDiscount) out += line(`Discount  ${financials.orderDiscount}`);
  if (financials.gstAmount) {
    out += line(`CGST  ${financials.cgstAmount ?? ""}`);
    out += line(`SGST  ${financials.sgstAmount ?? ""}`);
  }
  out += line(`TOTAL  ${financials.grandTotal ?? ""}`);
  if (restaurant.footer) {
    out += line("");
    out += line(restaurant.footer);
  }
  return out;
}

export function renderJob(job) {
  if (job.kind === "customer_bill") return renderCustomerBill(job.payload ?? {});
  return renderKitchenChit(job.payload ?? {});
}
