import { NextRequest, NextResponse } from "next/server";
import { requireSession, canManageMenu, canMutatePaymentGatewayCredentials } from "@/lib/auth";
import { featureDisabledResponse } from "@/lib/feature-guard";
import {
  getPaymentGatewaySettings,
  updatePaymentGatewaySettings,
} from "@/lib/payment-webhook-service";
import type { PaymentGatewayProvider } from "@/generated/prisma/client";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import { AUDIT_ACTION, AUDIT_CATEGORY, AUDIT_EVENT_KIND, AUDIT_SEVERITY } from "@/platform/forensics/constants";
import { tryAppendPlatformAuditEvent } from "@/platform/forensics/platform-audit-service";
import { markForensicSecurityDenied } from "@/platform/forensics/request-context";

async function handleGET() {
  const session = await requireSession();
  if (!session || !canManageMenu(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "payment_webhooks");
  if (blocked) return blocked;

  const settings = await getPaymentGatewaySettings(session.restaurantId);
  void tryAppendPlatformAuditEvent({
    category: AUDIT_CATEGORY.CONFIG,
    action: AUDIT_ACTION.GATEWAY_CONFIG_VIEWED,
    restaurantId: session.restaurantId,
    resourceType: "Restaurant",
    resourceId: session.restaurantId,
  });
  return NextResponse.json({ settings });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canMutatePaymentGatewayCredentials(session.role)) {
    markForensicSecurityDenied();
    void tryAppendPlatformAuditEvent({
      eventKind: AUDIT_EVENT_KIND.SECURITY,
      severity: AUDIT_SEVERITY.WARN,
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.GATEWAY_CREDENTIAL_CHANGE_DENIED,
      outcome: "DENIED",
      restaurantId: session.restaurantId,
      resourceType: "Restaurant",
      resourceId: session.restaurantId,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blocked = await featureDisabledResponse(session.restaurantId, "payment_webhooks");
  if (blocked) return blocked;

  const body = await req.json();
  try {
    const settings = await updatePaymentGatewaySettings(session.restaurantId, {
      provider: (body.provider ?? null) as PaymentGatewayProvider | null,
      keyId: typeof body.keyId === "string" ? body.keyId : undefined,
      secret: typeof body.secret === "string" && body.secret.trim() ? body.secret : undefined,
      webhookSecret:
        typeof body.webhookSecret === "string" && body.webhookSecret.trim()
          ? body.webhookSecret
          : undefined,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 },
    );
  }
}

export const PATCH = withForensicApiRoute(handlePATCH);
