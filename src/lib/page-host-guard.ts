import { notFound } from "next/navigation";
import { assertPagePathSlug } from "@/platform/tenant-scope";

export async function requirePageRestaurantSlug(slug: string) {
  if (!(await assertPagePathSlug(slug))) {
    notFound();
  }
}
