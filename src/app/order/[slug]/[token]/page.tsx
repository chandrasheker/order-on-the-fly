import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isDatabaseNotReadyError } from "@/lib/db-errors";
import { OrderPageClient } from "@/components/customer/OrderPageClient";
import { DatabaseSetupRequired } from "@/components/DatabaseSetupRequired";
import { StaleTableLink } from "@/components/customer/StaleTableLink";
import { requirePageRestaurantSlug } from "@/lib/page-host-guard";

async function resolveTable(slug: string, token: string) {
  const byToken = await prisma.table.findFirst({
    where: { qrToken: token, restaurant: { slug }, isActive: true },
  });
  if (byToken) return byToken;

  const stableMatch = token.match(/^(.+)-table-(\d+)$/);
  if (stableMatch && stableMatch[1] === slug) {
    return prisma.table.findFirst({
      where: {
        number: parseInt(stableMatch[2], 10),
        restaurant: { slug },
        isActive: true,
      },
    });
  }

  const tableNumMatch = token.match(/^table-(\d+)$/i);
  if (tableNumMatch) {
    return prisma.table.findFirst({
      where: {
        number: parseInt(tableNumMatch[1], 10),
        restaurant: { slug },
        isActive: true,
      },
    });
  }

  return null;
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  await requirePageRestaurantSlug(slug);

  try {
    if (token === "demo") {
      const table = await prisma.table.findFirst({
        where: { restaurant: { slug }, number: 1, isActive: true },
      });
      if (table) redirect(`/order/${slug}/${table.qrToken}/check-in`);
      return <StaleTableLink slug={slug} token={token} />;
    }

    const table = await resolveTable(slug, token);
    if (!table) {
      return <StaleTableLink slug={slug} token={token} />;
    }

    if (table.qrToken !== token) {
      redirect(`/order/${slug}/${table.qrToken}`);
    }

    return <OrderPageClient slug={slug} token={table.qrToken} />;
  } catch (error) {
    if (isDatabaseNotReadyError(error)) {
      return <DatabaseSetupRequired />;
    }
    throw error;
  }
}
