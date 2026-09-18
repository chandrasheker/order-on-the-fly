import type { MetadataRoute } from "next";
import { getCompanyPublicOrigin } from "@/platform/host";

export default function robots(): MetadataRoute.Robots {
  const origin = getCompanyPublicOrigin() || "https://dvadtech.in";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/oof"],
      disallow: ["/oof/platform", "/platform", "/admin", "/staff", "/api/", "/tenant"],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin.replace(/^https?:\/\//, ""),
  };
}
