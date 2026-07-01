import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

export const MENU_CATEGORY_PRESETS = [
  { name: "Today's Special", slug: "todays-special", icon: "⭐" },
  { name: "Biryanis", slug: "biryanis", icon: "🍚" },
  { name: "Snacks", slug: "snacks", icon: "🥟" },
  { name: "Beverages", slug: "beverages", icon: "🥤" },
  { name: "Tea", slug: "tea", icon: "☕" },
  { name: "Mains", slug: "mains", icon: "🍛" },
  { name: "Desserts", slug: "desserts", icon: "🍰" },
] as const;

export async function ensureStarterMenuCategories(restaurantId: string) {
  const count = await prisma.menuCategory.count({ where: { restaurantId } });
  if (count > 0) return false;

  await prisma.menuCategory.createMany({
    data: MENU_CATEGORY_PRESETS.map((preset, index) => ({
      restaurantId,
      name: preset.name,
      slug: preset.slug,
      icon: preset.icon,
      sortOrder: index,
    })),
  });

  return true;
}

export async function createMenuCategory(
  restaurantId: string,
  input: { name: string; icon?: string | null },
) {
  const name = input.name.trim();
  if (!name) throw new Error("Category name is required");

  const baseSlug = slugify(name);
  if (!baseSlug) throw new Error("Invalid category name");

  let slug = baseSlug;
  let attempt = 1;
  while (
    await prisma.menuCategory.findFirst({
      where: { restaurantId, slug },
      select: { id: true },
    })
  ) {
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  const maxSort = await prisma.menuCategory.aggregate({
    where: { restaurantId },
    _max: { sortOrder: true },
  });

  const preset = MENU_CATEGORY_PRESETS.find(
    (p) => p.slug === baseSlug || p.name.toLowerCase() === name.toLowerCase(),
  );

  return prisma.menuCategory.create({
    data: {
      restaurantId,
      name,
      slug,
      icon: input.icon?.trim() || preset?.icon || "🍽️",
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function updateMenuCategory(
  restaurantId: string,
  categoryId: string,
  input: { name?: string; icon?: string | null },
) {
  const category = await prisma.menuCategory.findFirst({
    where: { id: categoryId, restaurantId },
  });
  if (!category) throw new Error("Category not found");

  const name = input.name?.trim() || category.name;
  return prisma.menuCategory.update({
    where: { id: categoryId },
    data: {
      name,
      ...(input.icon !== undefined && { icon: input.icon?.trim() || "🍽️" }),
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function deleteMenuCategory(restaurantId: string, categoryId: string) {
  const category = await prisma.menuCategory.findFirst({
    where: { id: categoryId, restaurantId },
    include: { _count: { select: { items: true } } },
  });
  if (!category) throw new Error("Category not found");

  if (category._count.items > 0) {
    throw new Error("Remove all items from this category before deleting it");
  }

  await prisma.menuCategory.delete({ where: { id: categoryId } });
}

export async function addPresetCategories(restaurantId: string, slugs: string[]) {
  const existing = await prisma.menuCategory.findMany({
    where: { restaurantId },
    select: { slug: true },
  });
  const have = new Set(existing.map((c) => c.slug));

  const toAdd = MENU_CATEGORY_PRESETS.filter((p) => slugs.includes(p.slug) && !have.has(p.slug));
  if (toAdd.length === 0) return [];

  const maxSort = await prisma.menuCategory.aggregate({
    where: { restaurantId },
    _max: { sortOrder: true },
  });
  let sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const created = [];
  for (const preset of toAdd) {
    const row = await prisma.menuCategory.create({
      data: {
        restaurantId,
        name: preset.name,
        slug: preset.slug,
        icon: preset.icon,
        sortOrder: sortOrder++,
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    created.push(row);
  }

  return created;
}
