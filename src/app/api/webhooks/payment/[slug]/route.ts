import { NextRequest, NextResponse } from "next/server";
import { processPaymentWebhook } from "@/lib/payment-webhook-service";
import { logApiError, logApiRequest } from "@/lib/logger";
import { rejectIfSlugEscapesHost } from "@/platform/tenant-scope";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const provider = req.nextUrl.searchParams.get("provider") ?? "razorpay";
  logApiRequest("webhooks/payment/[slug]", "POST", { slug, provider });

  try {
    const blocked = await rejectIfSlugEscapesHost(req, slug);
    if (blocked) return blocked;

    const rawBody = await req.text();
    const result = await processPaymentWebhook({
      slug,
      provider,
      rawBody,
      headers: req.headers,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, message: result.message });
  } catch (error) {
    logApiError("webhooks/payment/[slug]", "POST", error, { slug });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
