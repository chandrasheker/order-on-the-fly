import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeOrderFinancials,
  financialsForOrder,
  capturedPaymentsTotal,
  refundedPaymentsTotal,
} from "@/lib/order-financials";

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

  it("adds GST to amount due when receipt tax is enabled", () => {
    const result = computeOrderFinancials({
      items: [{ unitPrice: 200, quantity: 1, status: "SERVED" }],
      discountAmount: 0,
      gstEnabled: true,
      gstRate: 5,
    });
    assert.equal(result.gstAmount, 10);
    assert.equal(result.cgstAmount + result.sgstAmount, 10);
    assert.equal(result.grandTotal, 210);
    assert.equal(result.amountDue, 210);
  });

  it("applies GST after the order discount", () => {
    const result = computeOrderFinancials({
      items: [{ unitPrice: 200, quantity: 1, status: "SERVED" }],
      discountAmount: 50,
      gstEnabled: true,
      gstRate: 5,
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
});
