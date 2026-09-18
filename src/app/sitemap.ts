import type { MetadataRoute } from "next";
import { getCompanyPublicOrigin } from "@/platform/host";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getCompanyPublicOrigin() || "https://dvadtech.in";
  return [
    { url: `${origin}/`, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${origin}/oof`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
  ];
}
