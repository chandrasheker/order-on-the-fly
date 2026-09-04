import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, canManageMenu } from "@/lib/auth";
import { getUploadedImageFile } from "@/lib/image-upload";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";
import {
  getPaymentQrPublicUrl,
  savePaymentQrFile,
  validatePaymentQrFile,
} from "@/lib/payment-qr-storage";

async function handlePOST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session || !canManageMenu(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = getUploadedImageFile(formData);
    if (!file) {
      return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
    }

    const validationError = validatePaymentQrFile(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    await savePaymentQrFile(session.restaurantId, file);

    const paymentQrUrl = getPaymentQrPublicUrl(session.restaurantSlug, Date.now());
    const updated = await prisma.restaurant.update({
      where: { id: session.restaurantId },
      data: { paymentQrUrl },
      select: { paymentQrUrl: true },
    });

    return NextResponse.json({
      settings: updated,
      message: "PhonePe QR uploaded successfully.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withForensicApiRoute(handlePOST);
