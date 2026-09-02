import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { findPaymentQrFile } from "@/lib/payment-qr-storage";
import { rejectIfSlugEscapesHost } from "@/platform/tenant-scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const blocked = await rejectIfSlugEscapesHost(req, slug);
  if (blocked) return blocked;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, paymentQrUrl: true },
  });

  if (!restaurant?.paymentQrUrl) {
    return NextResponse.json({ error: "Payment QR not configured" }, { status: 404 });
  }

  const stored = await findPaymentQrFile(restaurant.id);
  if (!stored) {
    return NextResponse.json({ error: "Payment QR file not found" }, { status: 404 });
  }

  const data = await fs.readFile(stored.filePath);

  return new NextResponse(data, {
    headers: {
      "Content-Type": stored.contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
