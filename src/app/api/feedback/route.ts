import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logApiError, logApiRequest, logInfo } from "@/lib/logger";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const feedbacks = await prisma.feedback.findMany({
    where: { restaurantId: session.restaurantId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const avg =
    feedbacks.length > 0
      ? feedbacks.reduce((s, f) => s + f.stars, 0) / feedbacks.length
      : 0;

  return NextResponse.json({ feedbacks, averageStars: avg });
}

export async function POST(req: NextRequest) {
  logApiRequest("feedback", "POST");
  try {
    const { tableToken, stars, message, customerName, orderId } = await req.json();

    if (!tableToken || !stars || stars < 1 || stars > 5) {
      return NextResponse.json({ error: "Valid rating required (1-5 stars)" }, { status: 400 });
    }

    const table = await prisma.table.findUnique({
      where: { qrToken: tableToken },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const feedback = await prisma.feedback.create({
      data: {
        stars: parseInt(String(stars), 10),
        message: message?.trim() || null,
        customerName: customerName?.trim() || null,
        tableNumber: table.number,
        orderId: orderId || null,
        restaurantId: table.restaurantId,
      },
    });

    logInfo("api:feedback", "Feedback submitted", {
      tableNumber: table.number,
      stars: feedback.stars,
      orderId: feedback.orderId,
    });

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    logApiError("feedback", "POST", error);
    return NextResponse.json({ error: "Failed to submit feedback" }, { status: 500 });
  }
}
