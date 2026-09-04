import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

const MAX_BYTES = 512 * 1024;
const ALLOWED_PREFIXES = ["http://", "https://", "/"];

async function handleGET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const url = decodeURIComponent(rawUrl).trim();
  if (!ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return NextResponse.json({ error: "Invalid logo URL" }, { status: 400 });
  }

  try {
    const absolute =
      url.startsWith("/") && req.nextUrl.origin
        ? new URL(url, req.nextUrl.origin).toString()
        : url;

    const response = await fetch(absolute, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Logo fetch failed" }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") ?? "image/png";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Not an image" }, { status: 400 });
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Logo too large" }, { status: 413 });
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Logo fetch failed" }, { status: 502 });
  }
}

export const GET = withForensicApiRoute(handleGET);
