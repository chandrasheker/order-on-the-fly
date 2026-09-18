import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { DvadtechHomePage } from "@/components/marketing/company/DvadtechHomePage";
import {
  allowsLegacyRestaurantScoping,
  classifyRequestHost,
  getCompanyPublicOrigin,
} from "@/platform/host";
import { resolveTenantFromHeaders } from "@/platform/host-tenant";

export async function generateMetadata(): Promise<Metadata> {
  const host = classifyRequestHost(await headers());
  if (host.kind === "reserved" && !allowsLegacyRestaurantScoping(host)) {
    const origin = getCompanyPublicOrigin() || "https://dvadtech.in";
    return {
      title: "DVADTech | Technology Built Around Real Problems",
      description:
        "DVADTech builds practical software and AI-integrated products around real operational problems — starting with Order-on-the-Fly for restaurants.",
      alternates: { canonical: `${origin}/` },
    };
  }
  return {
    title: "Staff login · TableTap",
    description: "Restaurant staff sign-in for Order-on-the-Fly / TableTap.",
  };
}

export default async function HomePage() {
  const resolution = await resolveTenantFromHeaders();
  if (resolution.ok && resolution.kind === "tenant") {
    redirect("/tenant");
  }

  const host = classifyRequestHost(await headers());
  if (host.kind === "reserved" && !allowsLegacyRestaurantScoping(host)) {
    return <DvadtechHomePage />;
  }
  return <LoginForm />;
}
