import { prisma } from "@/lib/prisma";
import { sellableOrOutOfStockWhere } from "@/lib/menu-stock";

export async function getRestaurantDisplayMenu(slug: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      backgroundImageUrl: true,
    },
  });

  if (!restaurant) return null;

  const { getRestaurantAccessState } = await import("@/lib/access-control-service");
  const access = await getRestaurantAccessState(restaurant.id);
  if (!access.ok) return null;

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId: restaurant.id, isEnabled: true },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: sellableOrOutOfStockWhere,
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          isVeg: true,
          isSpicy: true,
          prepTimeMinutes: true,
          imageUrl: true,
          trackInventory: true,
          stockQuantity: true,
          isAvailable: true,
        },
      },
    },
  });

  return {
    restaurant,
    categories: categories.filter((cat) => cat.items.length > 0),
    updatedAt: new Date().toISOString(),
  };
}
