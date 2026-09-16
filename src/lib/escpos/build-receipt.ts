import type { ReceiptPayload } from "@/lib/receipt-service";
import { EscPosEncoder, centerPad, formatReceiptMoney, padLine, wrapText } from "@/lib/escpos/encoder";
import { logoToEscPosRaster } from "@/lib/escpos/raster-image";

const LINE_WIDTH = 32;
/** Print-head to cutter gap on 58/80mm POS printers is ~30–50mm. */
export const RECEIPT_CUT_FEED_LINES = 8;

export async function buildEscPosReceipt(receipt: ReceiptPayload) {
  const encoder = new EscPosEncoder().init();

  const logo = await logoToEscPosRaster(receipt.restaurant.logoUrl);
  if (logo) {
    encoder.align("center").rasterImage(logo.data, logo.widthBytes, logo.height).feed(1);
  }

  // Double-width name uses 16 columns. Then force left + space-pad: many 58mm
  // printers ignore ESC a, and GS ! (size) often resets justification to left.
  encoder.align("left").bold(true).size(2, 2);
  writeCentered(encoder, receipt.restaurant.name, 16);
  encoder.bold(false).size(1, 1);

  if (receipt.restaurant.address) {
    writeCentered(encoder, receipt.restaurant.address);
  }

  if (receipt.restaurant.phone) {
    writeCentered(encoder, `Tel: ${receipt.restaurant.phone}`);
  }

  if (receipt.restaurant.gstin) {
    writeCentered(encoder, `GSTIN: ${receipt.restaurant.gstin}`);
  }

  encoder.line("--------------------------------");
  writeCentered(
    encoder,
    receipt.order.billNumber ? `Bill ${receipt.order.billNumber}` : `Order #${receipt.order.orderNumber}`,
  );
  writeCentered(encoder, `Order #${receipt.order.orderNumber}`);
  writeCentered(encoder, `Table ${receipt.order.tableNumber}`);
  writeCentered(encoder, formatReceiptDate(receipt.order.paidAt));
  if (receipt.order.customerName) {
    writeCentered(encoder, `Guest: ${receipt.order.customerName}`);
  }

  encoder
    .line("--------------------------------")
    .line("ITEM            QTY    AMT")
    .line("--------------------------------");

  for (const item of receipt.items) {
    const nameLines = wrapText(item.name, 16);
    nameLines.forEach((nameLine, index) => {
      if (index === 0) {
        encoder.line(
          padLine(
            `${nameLine}`.padEnd(16).slice(0, 16),
            `${String(item.quantity).padStart(2)} ${formatReceiptMoney(item.lineTotal).padStart(8)}`,
            LINE_WIDTH,
          ),
        );
      } else {
        encoder.line(nameLine.slice(0, LINE_WIDTH));
      }
    });
  }

  encoder.line("--------------------------------");
  encoder.line(padLine("Subtotal", formatReceiptMoney(receipt.subtotal), LINE_WIDTH));
  if ((receipt.discountAmount ?? 0) > 0) {
    encoder.line(padLine("Discount", `-${formatReceiptMoney(receipt.discountAmount ?? 0)}`, LINE_WIDTH));
  }

  if (receipt.restaurant.gstEnabled && receipt.gstAmount > 0) {
    const halfRate = receipt.restaurant.gstRate / 2;
    const included = receipt.restaurant.gstInclusive === true;
    const suffix = included ? " incl." : "";
    encoder
      .line(padLine(`CGST @ ${halfRate}%${suffix}`, formatReceiptMoney(receipt.cgstAmount), LINE_WIDTH))
      .line(padLine(`SGST @ ${halfRate}%${suffix}`, formatReceiptMoney(receipt.sgstAmount), LINE_WIDTH))
      .line(padLine(included ? "GST (incl. in MRP)" : "GST Total", formatReceiptMoney(receipt.gstAmount), LINE_WIDTH));
  }

  encoder
    .bold(true)
    .line(padLine("TOTAL", formatReceiptMoney(receipt.total), LINE_WIDTH))
    .bold(false)
    .line("--------------------------------");
  writeCentered(encoder, "PAID");
  encoder.feed(1);

  if (receipt.restaurant.footer) {
    writeCentered(encoder, receipt.restaurant.footer);
  } else {
    writeCentered(encoder, "Thank you! Visit again.");
  }

  encoder.feed(RECEIPT_CUT_FEED_LINES).cut(true);
  return encoder.build();
}

function writeCentered(encoder: EscPosEncoder, text: string, width = LINE_WIDTH) {
  for (const part of wrapText(text, width)) {
    encoder.line(centerPad(part, width));
  }
}

function formatReceiptDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
