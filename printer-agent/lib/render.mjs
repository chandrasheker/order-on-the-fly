function wrapText(text, width = 32) {
  const words = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += width) {
        lines.push(word.slice(i, i + width));
      }
      current = lines.pop() ?? "";
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function centerLine(text, width = 32) {
  const s = String(text ?? "").slice(0, width);
  const pad = Math.max(0, Math.floor((width - s.length) / 2));
  return `${" ".repeat(pad)}${s}`;
}

function line(text = "") {
  return `${String(text)}\n`;
}

function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  return (Math.round(n * 100) / 100).toFixed(2);
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
  out += line(centerLine(restaurant.name ?? "Receipt"));
  if (restaurant.address) {
    for (const addressLine of wrapText(restaurant.address, 32)) {
      out += line(centerLine(addressLine));
    }
  }
  if (restaurant.phone) out += line(centerLine(`Tel: ${restaurant.phone}`));
  if (restaurant.gstin) {
    for (const gstinLine of wrapText(`GSTIN: ${restaurant.gstin}`, 32)) {
      out += line(centerLine(gstinLine));
    }
  }
  if (payload.branch?.name) out += line(centerLine(payload.branch.name));
  out += line("--------------------------------");
  out += line(centerLine(`Bill ${payload.billNumber ?? order.billNumber ?? ""}`));
  out += line(centerLine(`Order #${order.orderNumber ?? ""}`));
  out += line(centerLine(`Table ${order.tableNumber ?? ""}`));
  if (payload.finalizedAt) out += line(centerLine(String(payload.finalizedAt)));
  out += line("--------------------------------");
  for (const item of items) {
    const amount = item.lineTotal == null ? "" : formatMoney(item.lineTotal);
    out += line(`${item.quantity ?? 1} x ${item.name ?? "Item"}  ${amount}`.trimEnd());
  }
  out += line("----------------");
  out += line(`Subtotal  ${formatMoney(financials.taxableSubtotal ?? financials.itemSubtotal)}`);
  if (financials.orderDiscount) out += line(`Discount  ${formatMoney(financials.orderDiscount)}`);
  if (financials.gstAmount) {
    out += line(`CGST  ${formatMoney(financials.cgstAmount)}`);
    out += line(`SGST  ${formatMoney(financials.sgstAmount)}`);
    out += line(`GST  ${formatMoney(financials.gstAmount)}`);
  }
  out += line(`TOTAL  ${formatMoney(financials.grandTotal)}`);
  if (restaurant.footer) {
    out += line("");
    for (const footerLine of wrapText(restaurant.footer, 32)) {
      out += line(footerLine);
    }
    out += line("");
    out += line("");
  }
  return out;
}

export function renderJob(job) {
  if (job.kind === "customer_bill") return renderCustomerBill(job.payload ?? {});
  return renderKitchenChit(job.payload ?? {});
}
