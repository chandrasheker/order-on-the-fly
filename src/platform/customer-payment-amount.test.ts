import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canStartCustomerPayment,
  customerPaymentAction,
  resolveCanonicalCustomerDue,
  shouldOfferManualUpiIntent,
} from "@/lib/customer-payment-amount";
import { computeOrderFinancials } from "@/lib/order-financials";
import { buildUpiIntents } from "@/lib/upi-intent";

describe("canonical customer payment amount", () => {
  it("never falls back to raw item totals when tab remaining is missing", () => {
    assert.equal(resolveCanonicalCustomerDue(undefined), null);
    assert.equal(resolveCanonicalCustomerDue(null), null);
    assert.equal(canStartCustomerPayment(null), false);
    assert.equal(shouldOfferManualUpiIntent({
      canonicalDue: null,
      unpaidOrderCount: 1,
      upiVpa: "abcrestaurant@upi",
    }), false);
  });

  it("uses GST/discount financial due for UPI intent, not raw item total", () => {
    const items = [{ unitPrice: 200, quantity: 1, status: "SERVED" as const }];
    const financials = computeOrderFinancials({
      items,
      discountAmount: 50,
      gstEnabled: true,
      gstRate: 5,
    });
    const rawItemTotal = 200;
    assert.notEqual(financials.amountDue, rawItemTotal);
    const canonical = resolveCanonicalCustomerDue(financials.amountDue);
    assert.equal(canonical, 157.5);
    const intents = buildUpiIntents({
      vpa: "abcrestaurant@upi",
      payeeName: "ABC",
      amount: canonical!,
      transactionRef: "ORD1",
    });
    assert.match(intents.generic, /am=157\.50/);
  });

  it("routes multi-order tables to staff table confirmation, not one-order pending UPI", () => {
    assert.equal(
      customerPaymentAction({ unpaidOrderCount: 2, upiVpa: "abcrestaurant@upi" }),
      "request-payment",
    );
    assert.equal(
      shouldOfferManualUpiIntent({
        canonicalDue: 500,
        unpaidOrderCount: 2,
        upiVpa: "abcrestaurant@upi",
      }),
      false,
    );
    assert.equal(
      customerPaymentAction({ unpaidOrderCount: 1, upiVpa: "abcrestaurant@upi" }),
      "initiate-manual-upi",
    );
  });
});
