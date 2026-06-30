import type { ReceiptPayload } from "@/lib/receipt-service";
import { EscPosEncoder, formatReceiptMoney, padLine, wrapText } from "@/lib/escpos/encoder";
import { logoToEscPosRaster } from "@/lib/escpos/raster-image";

const LINE_WIDTH = 32;

export async function buildEscPosReceipt(receipt: ReceiptPayload) {
  const encoder = new EscPosEncoder().init();

  const logo = await logoToEscPosRaster(receipt.restaurant.logoUrl);
  if (logo) {
    encoder.align("center").rasterImage(logo.data, logo.widthBytes, logo.height).feed(1);
  }

  encoder
    .align("center")
    .bold(true)
    .size(2, 2)
    .line(receipt.restaurant.name)
    .bold(false)
    .size(1, 1);

  if (receipt.restaurant.address) {
    for (const line of wrapText(receipt.restaurant.address, LINE_WIDTH)) {
      encoder.line(line);
    }
  }

  if (receipt.restaurant.phone) {
    encoder.line(`Tel: ${receipt.restaurant.phone}`);
  }

  if (receipt.restaurant.gstin) {
    encoder.line(`GSTIN: ${receipt.restaurant.gstin}`);
  }

  encoder
    .line("--------------------------------")
    .align("left")
    .line(`Order #${receipt.order.orderNumber}`)
    .line(`Table: ${receipt.order.tableNumber}`)
    .line(`Date: ${formatReceiptDate(receipt.order.paidAt)}`);

  if (receipt.order.customerName) {
    encoder.line(`Guest: ${receipt.order.customerName}`);
  }

  encoder.line("--------------------------------").line("ITEM            QTY    AMT").line("--------------------------------");

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

  if (receipt.restaurant.gstEnabled && receipt.gstAmount > 0) {
    const halfRate = receipt.restaurant.gstRate / 2;
    encoder
      .line(padLine(`CGST @ ${halfRate}%`, formatReceiptMoney(receipt.cgstAmount), LINE_WIDTH))
      .line(padLine(`SGST @ ${halfRate}%`, formatReceiptMoney(receipt.sgstAmount), LINE_WIDTH))
      .line(padLine(`GST Total`, formatReceiptMoney(receipt.gstAmount), LINE_WIDTH));
  }

  encoder
    .bold(true)
    .line(padLine("TOTAL", formatReceiptMoney(receipt.total), LINE_WIDTH))
    .bold(false)
    .line("--------------------------------")
    .align("center")
    .line("PAID")
    .feed(1);

  if (receipt.restaurant.footer) {
    for (const line of wrapText(receipt.restaurant.footer, LINE_WIDTH)) {
      encoder.line(line);
    }
  } else {
    encoder.line("Thank you! Visit again.");
  }

  encoder.feed(3).cut(true);
  return encoder.build();
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
