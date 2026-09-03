import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { getPublicReceiptByToken } from "@/lib/public-receipt-service";
import { hostRestaurantId, resolveRequestRestaurant } from "@/platform/tenant-scope";

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const headerList = await headers();
  const resolution = await resolveRequestRestaurant({ headers: headerList });
  if (!resolution.ok) notFound();

  const receipt = await getPublicReceiptByToken({
    token,
    hostRestaurantId: hostRestaurantId(resolution),
  });
  if (!receipt) notFound();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#14141f] p-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Digital receipt</p>
        <h1 className="mt-1 text-2xl font-bold text-white">{receipt.restaurant.name}</h1>
        {receipt.restaurant.address ? (
          <p className="mt-1 text-sm text-zinc-400">{receipt.restaurant.address}</p>
        ) : null}
        {receipt.restaurant.phone ? (
          <p className="text-sm text-zinc-400">{receipt.restaurant.phone}</p>
        ) : null}
        {receipt.restaurant.gstin ? (
          <p className="text-xs text-zinc-500">GSTIN {receipt.restaurant.gstin}</p>
        ) : null}
        {receipt.branch?.name ? (
          <p className="text-sm text-zinc-400">{receipt.branch.name}</p>
        ) : null}
        {receipt.branch?.address ? (
          <p className="text-sm text-zinc-400">{receipt.branch.address}</p>
        ) : null}

        <div className="mt-4 text-sm text-zinc-300">
          <p>Bill {receipt.order.billNumber}</p>
          <p>
            Table {receipt.order.tableNumber} · Order #{receipt.order.orderNumber}
          </p>
          <p>{new Date(receipt.order.paidAt).toLocaleString()}</p>
        </div>

        <ul className="mt-4 divide-y divide-white/10 text-sm">
          {receipt.items.map((item) => (
            <li key={`${item.name}-${item.quantity}`} className="flex justify-between py-2">
              <span>
                {item.quantity} × {item.name}
              </span>
              <span>{formatCurrency(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between text-zinc-400">
            <dt>Subtotal</dt>
            <dd>{formatCurrency(receipt.subtotal)}</dd>
          </div>
          {receipt.discountAmount > 0 ? (
            <div className="flex justify-between text-zinc-400">
              <dt>Discount</dt>
              <dd>-{formatCurrency(receipt.discountAmount)}</dd>
            </div>
          ) : null}
          {receipt.gstAmount > 0 ? (
            <>
              <div className="flex justify-between text-zinc-400">
                <dt>CGST</dt>
                <dd>{formatCurrency(receipt.cgstAmount)}</dd>
              </div>
              <div className="flex justify-between text-zinc-400">
                <dt>SGST</dt>
                <dd>{formatCurrency(receipt.sgstAmount)}</dd>
              </div>
            </>
          ) : null}
          <div className="flex justify-between pt-2 text-base font-semibold text-white">
            <dt>Total</dt>
            <dd>{formatCurrency(receipt.total)}</dd>
          </div>
        </dl>

        {receipt.footer ? (
          <p className="mt-6 text-center text-xs text-zinc-500">{receipt.footer}</p>
        ) : null}
      </div>
    </main>
  );
}
