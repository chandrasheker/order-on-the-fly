import { prisma } from "@/lib/prisma";
import { generatePublicToken, isHighEntropyPublicToken } from "@/lib/public-token";
import { receiptFromBillRow } from "@/lib/bill-service";
import { parseBillSnapshot } from "@/lib/bill-snapshot";
import { billOwnedByRestaurant } from "@/lib/payment-scope";

export async function ensureBillPublicToken(billId: string) {
  const bill = await prisma.bill.findUnique({ where: { id: billId }, select: { id: true, publicToken: true } });
  if (!bill) return null;
  if (isHighEntropyPublicToken(bill.publicToken)) return bill.publicToken;
  const token = generatePublicToken();
  const updated = await prisma.bill.update({
    where: { id: bill.id },
    data: { publicToken: token },
    select: { publicToken: true },
  });
  return updated.publicToken;
}

export async function getPublicReceiptByToken(params: {
  token: string;
  hostRestaurantId: string | null;
  requireRestaurant?: boolean;
}) {
  if (!isHighEntropyPublicToken(params.token)) return null;
  if (params.requireRestaurant && !params.hostRestaurantId) return null;
  const bill = await prisma.bill.findUnique({ where: { publicToken: params.token } });
  if (!bill || bill.status === "VOIDED") return null;
  if (params.hostRestaurantId && !billOwnedByRestaurant(params.hostRestaurantId, bill)) {
    return null;
  }
  const receipt = receiptFromBillRow(bill);
  if (!receipt) return null;
  const snapshot = parseBillSnapshot(bill.snapshot);
  return {
    restaurant: {
      name: receipt.restaurant.name,
      address: receipt.restaurant.address,
      phone: receipt.restaurant.phone,
      gstin: receipt.restaurant.gstin,
      footer: receipt.restaurant.footer,
    },
    branch: snapshot?.branch ?? null,
    order: {
      orderNumber: receipt.order.orderNumber,
      tableNumber: receipt.order.tableNumber,
      billNumber: receipt.order.billNumber,
      paidAt: receipt.order.paidAt,
    },
    items: receipt.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    subtotal: receipt.subtotal,
    discountAmount: receipt.discountAmount ?? 0,
    gstAmount: receipt.gstAmount,
    cgstAmount: receipt.cgstAmount,
    sgstAmount: receipt.sgstAmount,
    total: receipt.total,
    footer: receipt.restaurant.footer,
  };
}
