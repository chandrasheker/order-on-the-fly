import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { ApexLanding } from "@/components/ApexLanding";
import {
  allowsLegacyRestaurantScoping,
  classifyRequestHost,
  getTenantBaseDomain,
} from "@/platform/host";
import { resolveTenantFromHeaders } from "@/platform/host-tenant";

export default async function HomePage() {
  const resolution = await resolveTenantFromHeaders();
  if (resolution.ok && resolution.kind === "tenant") {
    redirect("/tenant");
  }

  const host = classifyRequestHost(await headers());
  if (host.kind === "reserved" && !allowsLegacyRestaurantScoping(host)) {
    return <ApexLanding hostname={host.hostname} baseDomain={getTenantBaseDomain()} />;
  }
  return <LoginForm />;
}
