import { MenuDisplayBoard } from "@/components/menu/MenuDisplayBoard";
import { requirePageRestaurantSlug } from "@/lib/page-host-guard";

export default async function MenuPrintPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requirePageRestaurantSlug(slug);
  return <MenuDisplayBoard slug={slug} printMode />;
}
