import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCustomerDiningAccess } from "@/lib/customer-dining-guard";
import { authorizeGuestTableSwitchRead, readDiningTokenFromRequest } from "@/lib/dining-access";
import { todayDateString } from "@/lib/utils";
import { loadTableByQrForRequest, opaqueNotFoundJson } from "@/platform/tenant-scope";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

function serializeRequest(request: Awaited<ReturnType<typeof findLatestCustomerRequest>>) {
  if (!request) return null;
  return {
    id: request.id,
    status: request.status,
    sourceTableNumber: request.sourceTableNumber,
    targetTableNumber: request.targetTableNumber,
    note: request.note,
    requestedAt: request.requestedAt,
    respondedAt: request.respondedAt,
    targetTableToken: request.targetTable.qrToken,
    restaurantSlug: request.restaurant.slug,
  };
}

async function findLatestCustomerRequest(
  sourceTableId: string,
  sessionKey: string,
  restaurantId: string,
) {
  return prisma.tableSwitchRequest.findFirst({
    where: {
      sourceTableId,
      sessionKey,
      restaurantId,
      requestedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    include: {
      targetTable: { select: { qrToken: true } },
      restaurant: { select: { slug: true } },
    },
    orderBy: { requestedAt: "desc" },
  });
}

async function handleGET(req: NextRequest) {
  const tableToken = req.nextUrl.searchParams.get("tableToken");
  const sessionKey = req.nextUrl.searchParams.get("sessionKey");

  if (!tableToken || !sessionKey) {
    return NextResponse.json({ error: "Missing tableToken or sessionKey" }, { status: 400 });
  }

  const { table, resolution } = await loadTableByQrForRequest(req, tableToken);
  const dining = await readDiningTokenFromRequest(req);
  const auth = authorizeGuestTableSwitchRead({
    resolutionOk: resolution.ok,
    table,
    dining,
    sessionKey,
  });
  if (!auth.ok) {
    if (auth.status === 404) return opaqueNotFoundJson();
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const latest = await findLatestCustomerRequest(auth.sourceTableId, sessionKey, auth.restaurantId);
  return NextResponse.json({ request: serializeRequest(latest) });
}

export const GET = withForensicApiRoute(handleGET);

async function handlePOST(req: NextRequest) {
  const { tableToken, sessionKey, targetTableNumber, note, customerName } = await req.json();

  if (!tableToken || !sessionKey || targetTableNumber === undefined) {
    return NextResponse.json(
      { error: "Missing tableToken, sessionKey, or targetTableNumber" },
      { status: 400 },
    );
  }

  const dining = await assertCustomerDiningAccess(req, String(tableToken), String(sessionKey));
  if (!dining.ok) {
    return NextResponse.json({ error: dining.error, code: dining.code }, { status: dining.status });
  }

  const targetNumber = parseInt(String(targetTableNumber), 10);
  if (!Number.isInteger(targetNumber) || targetNumber <= 0) {
    return NextResponse.json({ error: "Enter a valid table number" }, { status: 400 });
  }

  const { table: sourceTable, resolution } = await loadTableByQrForRequest(req, String(tableToken));
  if (!resolution.ok || !sourceTable || !sourceTable.isActive) {
    return opaqueNotFoundJson();
  }

  if (sourceTable.number === targetNumber) {
    return NextResponse.json({ error: "You are already at that table" }, { status: 400 });
  }

  const targetTable = await prisma.table.findFirst({
    where: {
      restaurantId: sourceTable.restaurantId,
      number: targetNumber,
      isActive: true,
    },
  });
  if (!targetTable) {
    return NextResponse.json({ error: `Table ${targetNumber} is not available` }, { status: 404 });
  }

  const movableOrderCount = await prisma.order.count({
    where: {
      tableId: sourceTable.id,
      date: todayDateString(),
      status: { not: "CANCELLED" },
      OR: [{ status: { not: "SERVED" } }, { paidAt: null }],
    },
  });

  if (movableOrderCount === 0) {
    return NextResponse.json(
      { error: "There is no active order or pending payment to switch" },
      { status: 400 },
    );
  }

  const existingPending = await prisma.tableSwitchRequest.findFirst({
    where: {
      sourceTableId: sourceTable.id,
      sessionKey: String(sessionKey),
      status: "PENDING",
    },
  });
  if (existingPending) {
    return NextResponse.json(
      { error: "A table switch request is already pending", requestId: existingPending.id },
      { status: 409 },
    );
  }

  const request = await prisma.tableSwitchRequest.create({
    data: {
      customerName: customerName?.trim() || null,
      sessionKey: String(sessionKey),
      note: note?.trim() || null,
      sourceTableNumber: sourceTable.number,
      targetTableNumber: targetTable.number,
      sourceTableId: sourceTable.id,
      targetTableId: targetTable.id,
      restaurantId: sourceTable.restaurantId,
    },
    include: {
      targetTable: { select: { qrToken: true } },
      restaurant: { select: { slug: true } },
    },
  });

  await prisma.alert.create({
    data: {
      type: "TABLE_SWITCH",
      message: `Table ${sourceTable.number} requested switch to Table ${targetTable.number}`,
      tableNumber: sourceTable.number,
      restaurantId: sourceTable.restaurantId,
    },
  });

  return NextResponse.json({ request: serializeRequest(request) }, { status: 201 });
}

export const POST = withForensicApiRoute(handlePOST);
