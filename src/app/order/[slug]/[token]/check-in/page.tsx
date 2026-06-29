import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isDatabaseNotReadyError } from "@/lib/db-errors";
import { DatabaseSetupRequired } from "@/components/DatabaseSetupRequired";
import { StaleTableLink } from "@/components/customer/StaleTableLink";
import { TableCheckInClient } from "./TableCheckInClient";

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

  return null;
}

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;

  try {
    const table = await resolveTable(slug, token);
    if (!table) {
      return <StaleTableLink slug={slug} token={token} />;
    }

    if (table.qrToken !== token) {
      redirect(`/order/${slug}/${table.qrToken}/check-in`);
    }

    return <TableCheckInClient slug={slug} token={table.qrToken} />;
  } catch (error) {
    if (isDatabaseNotReadyError(error)) {
      return <DatabaseSetupRequired />;
    }
    throw error;
  }
}
