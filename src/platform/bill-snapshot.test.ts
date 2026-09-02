import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBillSnapshot, receiptFromBillSnapshot } from "@/lib/bill-snapshot";
import { computeOrderFinancials } from "@/lib/order-financials";

describe("immutable bill snapshot", () => {
  const restaurant = {
    name: "ABC South",
    logoUrl: null,
    receiptAddress: "1 MG Road",
    receiptPhone: "999",
    receiptGstin: "29ABCDE1234F1Z5",
    receiptGstEnabled: true,
    receiptGstRate: 5,
    receiptFooter: "Thank you",
  };

  const order = {
    id: "ord_1",
    orderNumber: 12,
    customerName: "Rahul",
    table: { number: 4 },
    items: [{ itemName: "Tea", quantity: 2, unitPrice: 40, status: "SERVED" }],
    discountAmount: 10,
  };

  it("freezes financials and restaurant identity at finalize time", () => {
    const financials = computeOrderFinancials({
      items: order.items,
      discountAmount: order.discountAmount,
      gstEnabled: true,
      gstRate: 5,
    });
    const snapshot = buildBillSnapshot({
      billNumber: "20260902-0001",
      restaurant,
      order,
      financials,
      finalizedAt: new Date("2026-09-02T10:00:00.000Z"),
    });

    const laterRestaurant = { ...restaurant, name: "Renamed", receiptGstRate: 18, receiptGstin: "CHANGED" };
    const laterItems = [{ itemName: "Tea", quantity: 2, unitPrice: 99, status: "SERVED" }];
    const laterFinancials = computeOrderFinancials({
      items: laterItems,
      discountAmount: 0,
      gstEnabled: true,
      gstRate: 18,
    });

    const receipt = receiptFromBillSnapshot(snapshot);
    assert.equal(receipt.order.billNumber, "20260902-0001");
    assert.equal(receipt.restaurant.name, "ABC South");
    assert.equal(receipt.restaurant.gstin, "29ABCDE1234F1Z5");
    assert.equal(receipt.restaurant.gstRate, 5);
    assert.equal(receipt.items[0]?.unitPrice, 40);
    assert.equal(receipt.discountAmount, 10);
    assert.equal(receipt.total, financials.grandTotal);
    assert.notEqual(receipt.total, laterFinancials.grandTotal);
    assert.notEqual(receipt.restaurant.name, laterRestaurant.name);
  });

  it("keeps the same bill number for reprint payloads", () => {
    const financials = computeOrderFinancials({
      items: order.items,
      discountAmount: 0,
    });
    const snapshot = buildBillSnapshot({
      billNumber: "20260902-0007",
      restaurant,
      order,
      financials,
    });
    const reprint = receiptFromBillSnapshot(snapshot);
    assert.equal(reprint.order.billNumber, "20260902-0007");
    assert.equal(reprint.order.billNumber, snapshot.billNumber);
  });
});
