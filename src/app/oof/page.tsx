import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { OofLandingPage } from "@/components/marketing/oof/OofLandingPage";
import { getCompanyPublicOrigin, isConfiguredApexHost, classifyRequestHost } from "@/platform/host";

export async function generateMetadata(): Promise<Metadata> {
  const origin = getCompanyPublicOrigin() || "https://dvadtech.in";
  return {
    title: "Order-on-the-Fly | Restaurant Ordering & Operations by DVADTech",
    description:
      "QR ordering, kitchen coordination, payments, and collection controls for restaurants. TableTap by DVADTech — hospitality stays, unnecessary waiting does not.",
    alternates: { canonical: `${origin}/oof` },
  };
}

export default async function OofMarketingPage() {
  const host = classifyRequestHost(await headers());
  if (!isConfiguredApexHost(host)) {
    notFound();
  }
  return <OofLandingPage />;
}
