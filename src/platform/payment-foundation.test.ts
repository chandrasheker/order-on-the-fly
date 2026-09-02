import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amountsMatchPaise,
  getPaymentProvider,
  razorpayPaymentProvider,
} from "@/lib/payment-providers";
import { billOwnedByRestaurant, paymentOwnedByRestaurant, printJobOwnedByRestaurant } from "@/lib/payment-scope";
import { buildUpiIntents, formatUpiAmount, isValidUpiVpa } from "@/lib/upi-intent";
import crypto from "node:crypto";

describe("payment provider webhooks", () => {
  it("accepts a valid Razorpay signature and rejects a bad one", () => {
    const secret = "whsec_test";
    const rawBody = JSON.stringify({ event: "payment.captured" });
    const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const headers = new Headers({ "x-razorpay-signature": signature });
    assert.equal(razorpayPaymentProvider.verifyWebhook(rawBody, headers, secret).ok, true);

    const bad = new Headers({ "x-razorpay-signature": "0".repeat(signature.length) });
    assert.equal(razorpayPaymentProvider.verifyWebhook(rawBody, bad, secret).ok, false);
  });

  it("does not treat cash or manual UPI as webhook-authoritative", () => {
    assert.equal(getPaymentProvider("cash")?.verifyWebhook("", new Headers(), "x").ok, false);
    assert.equal(getPaymentProvider("manual_upi")?.verifyWebhook("", new Headers(), "x").ok, false);
  });

  it("rejects amount mismatches of more than one paisa", () => {
    assert.equal(amountsMatchPaise(845.5, 845.5), true);
    assert.equal(amountsMatchPaise(845.5, 845.51), true);
    assert.equal(amountsMatchPaise(100, 150), false);
  });
});

describe("tenant isolation helpers", () => {
  it("hides another restaurant's payment, bill, and print job", () => {
    assert.equal(paymentOwnedByRestaurant("abc", { restaurantId: "xyz", id: "P1" }), null);
    assert.equal(billOwnedByRestaurant("abc", { restaurantId: "xyz", id: "B1" }), null);
    assert.equal(printJobOwnedByRestaurant("abc", { restaurantId: "xyz", id: "J1" }), null);
    assert.equal(paymentOwnedByRestaurant("abc", { restaurantId: "abc", id: "P1" })?.id, "P1");
  });
});

describe("mobile UPI intent", () => {
  it("builds predetermined-amount UPI URIs", () => {
    assert.equal(isValidUpiVpa("abcrestaurant@upi"), true);
    assert.equal(isValidUpiVpa("nope"), false);
    assert.equal(formatUpiAmount(845.5), "845.50");
    const intents = buildUpiIntents({
      vpa: "abcrestaurant@upi",
      payeeName: "ABC South",
      amount: 845.5,
      transactionRef: "BILL202609020001",
      note: "Table 4",
    });
    assert.match(intents.generic, /^upi:\/\/pay\?/);
    assert.match(intents.gpay, /^gpay:\/\/upi\/pay\?/);
    assert.match(intents.phonepe, /^phonepe:\/\/pay\?/);
    assert.match(intents.generic, /am=845\.50/);
    assert.match(intents.generic, /pa=abcrestaurant%40upi/);
  });
});
