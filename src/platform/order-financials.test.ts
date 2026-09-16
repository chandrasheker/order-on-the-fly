import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeOrderFinancials,
  financialsForOrder,
  capturedPaymentsTotal,
  refundedPaymentsTotal,
} from "@/lib/order-financials";
import { buildReceiptPayload } from "@/lib/receipt-service";
import { centerPad, formatReceiptMoney, wrapText } from "@/lib/escpos/encoder";
import { buildEscPosReceipt, RECEIPT_CUT_FEED_LINES } from "@/lib/escpos/build-receipt";
import { formatCurrency } from "@/lib/utils";

describe("canonical order financials", () => {
  it("uses served items only for the subtotal", () => {
    const result = computeOrderFinancials({
      items: [
        { unitPrice: 100, quantity: 2, status: "SERVED" },
        { unitPrice: 50, quantity: 1, status: "PREPARING" },
        { unitPrice: 20, quantity: 1, status: "UNAVAILABLE" },
      ],
    });
    assert.equal(result.itemSubtotal, 200);
    assert.equal(result.grandTotal, 200);
    assert.equal(result.amountDue, 200);
  });

  it("applies order discount once and does not ignore it in amount due", () => {
    const result = computeOrderFinancials({
      items: [{ unitPrice: 200, quantity: 1, status: "SERVED" }],
      discountAmount: 50,
    });
    assert.equal(result.itemSubtotal, 200);
    assert.equal(result.orderDiscount, 50);
    assert.equal(result.taxableSubtotal, 150);
    assert.equal(result.grandTotal, 150);
    assert.equal(result.amountDue, 150);
  });

  it("clamps discount to the served subtotal", () => {
    const result = computeOrderFinancials({
      items: [{ unitPrice: 40, quantity: 1, status: "SERVED" }],
      discountAmount: 99,
    });
    assert.equal(result.orderDiscount, 40);
    assert.equal(result.grandTotal, 0);
    assert.equal(result.fullyPaid, true);
  });

  it("keeps GST inside MRP by default so menu prices are the billed total", () => {
    const result = computeOrderFinancials({
      items: [{ unitPrice: 30, quantity: 1, status: "SERVED" }],
      gstEnabled: true,
      gstRate: 5,
    });
    assert.equal(result.grandTotal, 30);
    assert.equal(result.amountDue, 30);
    assert.equal(result.taxableSubtotal, 28.57);
    assert.equal(result.gstAmount, 1.43);
    assert.equal(result.cgstAmount + result.sgstAmount, 1.43);
  });

  it("adds GST on top of menu prices when configured exclusive", () => {
    const result = computeOrderFinancials({
      items: [{ unitPrice: 200, quantity: 1, status: "SERVED" }],
      discountAmount: 0,
      gstEnabled: true,
      gstRate: 5,
      gstInclusive: false,
    });
    assert.equal(result.gstAmount, 10);
    assert.equal(result.cgstAmount + result.sgstAmount, 10);
    assert.equal(result.grandTotal, 210);
    assert.equal(result.amountDue, 210);
  });

  it("extracts inclusive GST from the discounted MRP, without inflating the bill", () => {
    const result = computeOrderFinancials({
      items: [{ unitPrice: 200, quantity: 1, status: "SERVED" }],
      discountAmount: 50,
      gstEnabled: true,
      gstRate: 5,
    });
    assert.equal(result.grandTotal, 150);
    assert.equal(result.taxableSubtotal, 142.86);
    assert.equal(result.gstAmount, 7.14);
  });

  it("applies exclusive GST after the order discount", () => {
    const result = computeOrderFinancials({
      items: [{ unitPrice: 200, quantity: 1, status: "SERVED" }],
      discountAmount: 50,
      gstEnabled: true,
      gstRate: 5,
      gstInclusive: false,
    });
    assert.equal(result.taxableSubtotal, 150);
    assert.equal(result.gstAmount, 7.5);
    assert.equal(result.grandTotal, 157.5);
  });

  it("uses integer paise so 0.1 + 0.2 style totals stay exact", () => {
    const result = computeOrderFinancials({
      items: [
        { unitPrice: 0.1, quantity: 1, status: "SERVED" },
        { unitPrice: 0.2, quantity: 1, status: "SERVED" },
      ],
    });
    assert.equal(result.itemSubtotalPaise, 30);
    assert.equal(result.grandTotal, 0.3);
  });

  it("counts only captured payments toward amount due", () => {
    const result = financialsForOrder({
      items: [{ unitPrice: 500, quantity: 1, status: "SERVED" }],
      payments: [
        { amount: 200, status: "CAPTURED" },
        { amount: 200, status: "PENDING" },
        { amount: 50, status: "REFUNDED", refundOfPaymentId: "p1" },
      ],
    });
    assert.equal(result.capturedPaymentTotal, 200);
    assert.equal(result.refundedTotal, 50);
    assert.equal(result.netPaid, 150);
    assert.equal(result.amountDue, 350);
    assert.equal(result.fullyPaid, false);
  });

  it("supports split and partial payments until the bill is covered", () => {
    const items = [{ unitPrice: 2450, quantity: 1, status: "SERVED" }];
    const first = financialsForOrder({
      items,
      payments: [{ amount: 1000, status: "CAPTURED" }],
    });
    assert.equal(first.amountDue, 1450);
    const second = financialsForOrder({
      items,
      payments: [
        { amount: 1000, status: "CAPTURED" },
        { amount: 1000, status: "CAPTURED" },
      ],
    });
    assert.equal(second.amountDue, 450);
    const paid = financialsForOrder({
      items,
      payments: [
        { amount: 1000, status: "CAPTURED" },
        { amount: 1000, status: "CAPTURED" },
        { amount: 450, status: "CAPTURED" },
      ],
    });
    assert.equal(paid.amountDue, 0);
    assert.equal(paid.fullyPaid, true);
  });

  it("treats legacy payments without status as captured", () => {
    assert.equal(capturedPaymentsTotal([{ amount: 100 }]), 100);
    assert.equal(refundedPaymentsTotal([{ amount: 25, refundOfPaymentId: "x" }]), 25);
  });

  it("is the same calculator used for checkout, due, and reconciliation cases", () => {
    const checkout = computeOrderFinancials({
      items: [{ unitPrice: 845.5, quantity: 1, status: "SERVED" }],
      discountAmount: 45.5,
      gstEnabled: true,
      gstRate: 5,
    });
    const recon = financialsForOrder({
      items: [{ unitPrice: 845.5, quantity: 1, status: "SERVED" }],
      discountAmount: 45.5,
      gstEnabled: true,
      gstRate: 5,
      payments: [],
    });
    assert.deepEqual(checkout, recon);
    assert.equal(checkout.itemSubtotalPaise, 84550);
    assert.equal(checkout.orderDiscountPaise, 4550);
  });

  it("prints GST as included without increasing the receipt total", () => {
    const payload = buildReceiptPayload(
      {
        name: "Cafe",
        logoUrl: null,
        receiptAddress: null,
        receiptPhone: null,
        receiptGstin: "29ABCDE1234F1Z5",
        receiptGstEnabled: true,
        receiptGstRate: 5,
        receiptGstInclusive: true,
        receiptFooter: null,
      },
      {
        id: "o1",
        orderNumber: 1,
        customerName: null,
        paidAt: new Date("2026-09-16T10:00:00.000Z"),
        table: { number: 1 },
        items: [{ itemName: "Water", quantity: 1, unitPrice: 30, status: "SERVED" }],
      },
    );
    assert.equal(payload.total, 30);
    assert.equal(payload.gstAmount, 1.43);
    assert.equal(payload.restaurant.gstInclusive, true);
  });
});

describe("receipt money decimals", () => {
  it("prints paise instead of rounding CGST/SGST to whole rupees", () => {
    assert.equal(formatReceiptMoney(1.5), "Rs.1.50");
    assert.equal(formatReceiptMoney(1.43), "Rs.1.43");
    assert.equal(formatReceiptMoney(3), "Rs.3.00");
    assert.equal(formatReceiptMoney(60), "Rs.60.00");
    assert.equal(formatCurrency(1.5, 2), "₹1.50");
    assert.equal(formatCurrency(3, 2), "₹3.00");
  });

  it("prints 2.5% CGST/SGST of ₹60 as 1.50 not 1", async () => {
    const financials = computeOrderFinancials({
      items: [{ unitPrice: 30, quantity: 2, status: "SERVED" }],
      gstEnabled: true,
      gstRate: 5,
      gstInclusive: false,
    });
    assert.equal(financials.itemSubtotal, 60);
    assert.equal(financials.cgstAmount, 1.5);
    assert.equal(financials.sgstAmount, 1.5);
    assert.equal(financials.gstAmount, 3);

    const bytes = await buildEscPosReceipt({
      restaurant: {
        name: "Cafe",
        logoUrl: null,
        address: null,
        phone: null,
        gstin: null,
        gstEnabled: true,
        gstRate: 5,
        gstInclusive: false,
        footer: null,
      },
      order: {
        id: "o1",
        orderNumber: 1,
        tableNumber: 4,
        customerName: null,
        paidAt: "2026-09-16T10:00:00.000Z",
      },
      items: [{ name: "Water", quantity: 2, unitPrice: 30, lineTotal: 60, status: "SERVED" }],
      subtotal: financials.itemSubtotal,
      gstAmount: financials.gstAmount,
      cgstAmount: financials.cgstAmount,
      sgstAmount: financials.sgstAmount,
      total: financials.grandTotal,
    });
    const text = Buffer.from(bytes).toString("latin1");
    assert.match(text, /Rs\.1\.50/);
    assert.match(text, /Rs\.3\.00/);
    assert.equal((text.match(/Rs\.1\.50/g) ?? []).length, 2);
    assert.doesNotMatch(text, /Rs\.1[^0-9.]/);
  });
});

describe("POS receipt footer", () => {
  it("wraps a long footer without dropping words", () => {
    const lines = wrapText(
      "Thank you for dining with us. Please visit again soon and share your feedback.",
      32,
    );
    const joined = lines.join(" ");
    assert.match(joined, /Thank you for dining with us/);
    assert.match(joined, /share your feedback/);
    assert.equal(lines.every((line) => line.length <= 32), true);
  });

  it("keeps explicit footer line breaks and long tokens", () => {
    const lines = wrapText("GSTIN: 29ABCDE1234F1Z5\nPleaseComeAgainSoonAndBringFriends", 32);
    assert.equal(lines[0], "GSTIN: 29ABCDE1234F1Z5");
    assert.equal(lines.join("").includes("PleaseComeAgainSoonAndBringFriends"), true);
    assert.equal(lines.every((line) => line.length <= 32), true);
  });

  it("prints the full footer and feeds past the cutter", async () => {
    const footer = "Thank you for dining with us. Please visit again soon!";
    const bytes = await buildEscPosReceipt({
      restaurant: {
        name: "Cafe",
        logoUrl: null,
        address: null,
        phone: null,
        gstin: null,
        gstEnabled: false,
        gstRate: 0,
        footer,
      },
      order: {
        id: "o1",
        orderNumber: 1,
        tableNumber: 4,
        customerName: null,
        paidAt: "2026-09-16T10:00:00.000Z",
      },
      items: [{ name: "Water", quantity: 2, unitPrice: 30, lineTotal: 60, status: "SERVED" }],
      subtotal: 60,
      gstAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      total: 60,
    });
    const text = Buffer.from(bytes).toString("latin1");
    assert.match(text, /Thank you for dining with us/);
    assert.match(text, /visit again soon/);
    const feed = Buffer.from([0x1b, 0x64, RECEIPT_CUT_FEED_LINES]);
    assert.ok(Buffer.from(bytes).includes(feed), "expected extra line feed before cut");
  });

  it("space-pads GSTIN, bill, order, and table so cheap printers still center them", async () => {
    assert.equal(centerPad("Table 4", 32), `${" ".repeat(12)}Table 4`);
    assert.equal(centerPad("GSTIN: dskjhfkjshfjsdf", 32), `${" ".repeat(5)}GSTIN: dskjhfkjshfjsdf`);

    const bytes = await buildEscPosReceipt({
      restaurant: {
        name: "Cafe",
        logoUrl: null,
        address: null,
        phone: null,
        gstin: "dskjhfkjshfjsdf",
        gstEnabled: false,
        gstRate: 0,
        footer: null,
      },
      order: {
        id: "o1",
        orderNumber: 12,
        tableNumber: 4,
        customerName: null,
        paidAt: "2026-09-16T10:00:00.000Z",
        billNumber: "20260916-0001",
      },
      items: [{ name: "Water", quantity: 2, unitPrice: 30, lineTotal: 60, status: "SERVED" }],
      subtotal: 60,
      gstAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      total: 60,
    });
    const text = Buffer.from(bytes).toString("latin1");
    assert.match(text, / {5}GSTIN: dskjhfkjshfjsdf\n/);
    assert.match(text, /\n {7}Bill 20260916-0001\n/);
    assert.match(text, /\n {11}Order #12\n/);
    assert.match(text, /\n {12}Table 4\n/);
    assert.match(text, /\n {14}PAID\n/);
    assert.match(text, /\nITEM            QTY    AMT\n/);
    const gstinAt = indexOfAscii(bytes, "GSTIN: dskjhfkjshfjsdf");
    const itemsAt = indexOfAscii(bytes, "ITEM            QTY    AMT");
    assert.equal(lastAlignBefore(bytes, gstinAt), "left");
    assert.equal(lastAlignBefore(bytes, itemsAt), "left");
  });
});

function indexOfAscii(bytes: Uint8Array, value: string) {
  const needle = Buffer.from(value, "ascii");
  const haystack = Buffer.from(bytes);
  return haystack.indexOf(needle);
}

function lastAlignBefore(bytes: Uint8Array, offset: number) {
  let align: "left" | "center" | "right" | null = null;
  for (let i = 0; i < offset - 2; i += 1) {
    if (bytes[i] === 0x1b && bytes[i + 1] === 0x61) {
      const mode = bytes[i + 2];
      if (mode === 0) align = "left";
      else if (mode === 1) align = "center";
      else if (mode === 2) align = "right";
    }
  }
  return align;
}
