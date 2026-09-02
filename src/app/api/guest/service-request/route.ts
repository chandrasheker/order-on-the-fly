import { NextRequest, NextResponse } from "next/server";
import { createGuestServiceRequest } from "@/lib/guest-service-request-service";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { assertCustomerDiningAccess } from "@/lib/customer-dining-guard";
import type { GuestServiceType } from "@/generated/prisma/client";
import { loadTableByQrForRequest, opaqueNotFoundJson } from "@/platform/tenant-scope";

const VALID_TYPES: GuestServiceType[] = [
  "CALL_WAITER",
  "REQUEST_BILL",
  "WATER",
  "REFILL",
  "OTHER",
];

export async function POST(req: NextRequest) {
  try {
    const { tableToken, sessionKey, type, message } = await req.json();

    if (!tableToken || !sessionKey || !type) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid request type" }, { status: 400 });
    }

    const { table, resolution } = await loadTableByQrForRequest(req, tableToken);
    if (!resolution.ok || !table || !table.isActive) {
      return opaqueNotFoundJson();
    }

    const enabled = await isFeatureEnabled(table.restaurantId, "call_waiter");
    if (!enabled) {
      return NextResponse.json({ error: "Call waiter not enabled" }, { status: 403 });
    }

    const dining = await assertCustomerDiningAccess(req, tableToken, sessionKey);
    if (!dining.ok) {
      return NextResponse.json(
        { error: dining.error, code: dining.code },
        { status: dining.status },
      );
    }

    const request = await createGuestServiceRequest({
      restaurantId: table.restaurantId,
      tableId: table.id,
      sessionKey,
      type,
      message,
    });

    return NextResponse.json({ request }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 400 },
    );
  }
}
