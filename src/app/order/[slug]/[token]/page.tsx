import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OrderPageClient } from "@/components/customer/OrderPageClient";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;

  if (token === "demo") {
    const table = await prisma.table.findFirst({
      where: { restaurant: { slug }, number: 1 },
    });
    if (table) redirect(`/order/${slug}/${table.qrToken}`);
  }

  return <OrderPageClient slug={slug} token={token} />;
}
