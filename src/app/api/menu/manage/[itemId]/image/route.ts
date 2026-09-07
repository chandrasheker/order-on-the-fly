import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getUploadedImageFile } from "@/lib/image-upload";
import { MENU_MEDIA_MAX_UPLOAD_BYTES } from "@/lib/menu-media/constants";
import {
  authorizeMenuItemImageMutation,
  removeMenuItemImage,
  uploadMenuItemImage,
} from "@/lib/menu-media/service";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

export const runtime = "nodejs";

async function readUploadBytes(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return { ok: false as const, status: 400 as const, error: "Please upload a JPEG, PNG, or WebP image." };
  }
  const file = getUploadedImageFile(formData, "file");
  if (!file) {
    return { ok: false as const, status: 400 as const, error: "Please upload a JPEG, PNG, or WebP image." };
  }
  if (file.size > MENU_MEDIA_MAX_UPLOAD_BYTES) {
    return { ok: false as const, status: 413 as const, error: "Image must be 5 MB or smaller." };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  return { ok: true as const, bytes };
}

async function handlePOST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const session = await requireSession();
  const { itemId } = await params;
  const authorized = await authorizeMenuItemImageMutation(session, itemId);
  if (!authorized.ok) {
    return NextResponse.json({ error: authorized.error }, { status: authorized.status });
  }

  const uploaded = await readUploadBytes(req);
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.error }, { status: uploaded.status });
  }

  const result = await uploadMenuItemImage({
    restaurantId: authorized.session.restaurantId,
    itemId,
    bytes: uploaded.bytes,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ item: result.item, action: result.action });
}

async function handleDELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const session = await requireSession();
  const { itemId } = await params;
  const authorized = await authorizeMenuItemImageMutation(session, itemId);
  if (!authorized.ok) {
    return NextResponse.json({ error: authorized.error }, { status: authorized.status });
  }

  const result = await removeMenuItemImage({
    restaurantId: authorized.session.restaurantId,
    itemId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ item: result.item, success: true });
}

export const POST = withForensicApiRoute(handlePOST);
export const DELETE = withForensicApiRoute(handleDELETE);
