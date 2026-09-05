import { NextRequest, NextResponse } from "next/server";
import { getPublicReceiptByToken } from "@/lib/public-receipt-service";
import {
  opaqueNotFoundJson,
  publicCustomerHostScope,
  resolveRequestRestaurant,
} from "@/platform/tenant-scope";
import { logApiRequest } from "@/lib/logger";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

async function handleGET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  logApiRequest("receipts/public/[token]", "GET");
  const resolution = await resolveRequestRestaurant(req);
  const scope = publicCustomerHostScope(resolution);
  if (!scope.ok) return opaqueNotFoundJson();

  const receipt = await getPublicReceiptByToken({
    token,
    hostRestaurantId: scope.restaurantId,
    requireRestaurant: scope.requireRestaurant,
  });
  if (!receipt) return opaqueNotFoundJson();
  const { tryAppendPlatformAuditEvent } = await import("@/platform/forensics/platform-audit-service");
  const { AUDIT_ACTION, AUDIT_ACTOR_TYPE, AUDIT_CATEGORY } = await import("@/platform/forensics/constants");
  const { setForensicActor, setForensicResource } = await import("@/platform/forensics/request-context");
  setForensicActor({ type: AUDIT_ACTOR_TYPE.CUSTOMER });
  setForensicResource({ type: "Bill", label: receipt.order?.billNumber ?? null });
  void tryAppendPlatformAuditEvent({
    category: AUDIT_CATEGORY.MONEY,
    action: AUDIT_ACTION.PUBLIC_RECEIPT_ACCESSED,
    actorType: AUDIT_ACTOR_TYPE.CUSTOMER,
    restaurantId: scope.restaurantId,
    resourceType: "Bill",
    resourceLabel: receipt.order?.billNumber ?? null,
  });
  return NextResponse.json({ receipt });
}

export const GET = withForensicApiRoute(handleGET);
