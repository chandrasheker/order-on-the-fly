import { MenuDisplayBoard } from "@/components/menu/MenuDisplayBoard";

export default async function MenuPrintPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <MenuDisplayBoard slug={slug} printMode />;
}
