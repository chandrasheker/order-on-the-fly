import {
  backgroundImageExists,
  resolveBackgroundImagePublicUrl,
} from "@/lib/background-image-storage";

export async function getCustomerBackgroundImageUrl(restaurant: {
  id: string;
  slug: string;
  backgroundImageUrl: string | null;
}): Promise<string | null> {
  const flags = await import("@/lib/feature-flags").then((m) =>
    m.getRestaurantFeatureFlags(restaurant.id),
  );
  if (!flags.custom_background) return null;

  if (!(await backgroundImageExists(restaurant.id))) {
    const url = restaurant.backgroundImageUrl?.trim() ?? "";
    if (url && !url.includes("/api/branding/background/")) {
      return url;
    }
    return null;
  }

  return resolveBackgroundImagePublicUrl(restaurant);
}
