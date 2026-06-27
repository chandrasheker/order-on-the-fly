import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isDatabaseNotReadyError } from "@/lib/db-errors";
import { OrderPageClient } from "@/components/customer/OrderPageClient";
import { DatabaseSetupRequired } from "@/components/DatabaseSetupRequired";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;

  if (token === "demo") {
    try {
      const table = await prisma.table.findFirst({
        where: { restaurant: { slug }, number: 1 },
      });
      if (table) redirect(`/order/${slug}/${table.qrToken}`);
    } catch (error) {
      if (isDatabaseNotReadyError(error)) {
        return <DatabaseSetupRequired />;
      }
      throw error;
    }
  }

  return <OrderPageClient slug={slug} token={token} />;
}
