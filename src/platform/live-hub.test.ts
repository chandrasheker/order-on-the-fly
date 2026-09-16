import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pingLive, subscribeLive } from "@/lib/live-hub";

describe("live hub", () => {
  it("delivers pings to restaurant subscribers and ignores other restaurants", () => {
    const seen: string[] = [];
    const unsubA = subscribeLive("rest-a", (ping) => {
      seen.push(`a:${ping.type ?? ""}:${ping.tableId ?? ""}`);
    });
    const unsubB = subscribeLive("rest-b", (ping) => {
      seen.push(`b:${ping.type ?? ""}`);
    });

    pingLive({ restaurantId: "rest-a", type: "ORDER_CREATED", tableId: "table-1" });
    pingLive({ restaurantId: "rest-b", type: "ORDER_PAID" });
    pingLive({ restaurantId: "", type: "IGNORED" });

    assert.deepEqual(seen, ["a:ORDER_CREATED:table-1", "b:ORDER_PAID"]);
    unsubA();
    pingLive({ restaurantId: "rest-a", type: "AFTER_UNSUB" });
    assert.deepEqual(seen, ["a:ORDER_CREATED:table-1", "b:ORDER_PAID"]);
    unsubB();
  });
});
