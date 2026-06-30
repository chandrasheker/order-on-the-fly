import { getRestaurantFeatureFlags } from "@/lib/feature-flags";
import {
  backgroundImageExists,
  getBackgroundImagePublicUrl,
} from "@/lib/background-image-storage";

export async function getCustomerBackgroundImageUrl(restaurant: {
  id: string;
  slug: string;
  backgroundImageUrl: string | null;
}): Promise<string | null> {
  const flags = await getRestaurantFeatureFlags(restaurant.id);
  if (!flags.custom_background) return null;

  const hasUploaded = await backgroundImageExists(restaurant.id);
  if (hasUploaded) {
    return getBackgroundImagePublicUrl(restaurant.slug);
  }

  return restaurant.backgroundImageUrl;
}
