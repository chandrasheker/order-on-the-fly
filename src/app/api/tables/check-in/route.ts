import { NextRequest, NextResponse } from "next/server";
import { logApiError, logApiRequest } from "@/lib/logger";
import { issueDiningAccessResponse } from "@/lib/customer-dining-guard";
import { validateCurrentTableAccessCode } from "@/lib/table-access-code";
import { loadTableByQrForRequest, opaqueNotFoundJson } from "@/platform/tenant-scope";

export async function POST(req: NextRequest) {
  logApiRequest("tables/check-in", "POST");
  try {
    const { tableToken, sessionKey, accessCode } = await req.json();
    if (!tableToken || !sessionKey || !accessCode) {
      return NextResponse.json(
        { error: "Missing tableToken, sessionKey, or accessCode" },
        { status: 400 },
      );
    }

    const { table, resolution } = await loadTableByQrForRequest(req, tableToken);
    if (!resolution.ok || !table || !table.isActive) {
      return opaqueNotFoundJson();
    }

    if (!validateCurrentTableAccessCode(table, String(accessCode))) {
      return NextResponse.json(
        {
          error: "This QR session expired. Please scan the table QR again.",
          code: "TABLE_ACCESS_CODE_EXPIRED",
          tableNumber: table.number,
        },
        { status: 403 },
      );
    }

    if (!table.orderingEnabled) {
      return NextResponse.json(
        {
          error:
            "This table is not open for ordering yet. Please ask your server to seat you and enable ordering.",
          code: "TABLE_ORDERING_CLOSED",
          tableNumber: table.number,
        },
        { status: 403 },
      );
    }

    return issueDiningAccessResponse(table, sessionKey);
  } catch (error) {
    logApiError("tables/check-in", "POST", error);
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }
}
