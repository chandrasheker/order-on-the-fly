import { notFound } from "next/navigation";
import { resolveTenantFromHeaders } from "@/platform/host-tenant";
import { TenantHubHome } from "@/components/tenant/TenantHubHome";

export default async function TenantHubPage() {
  const resolution = await resolveTenantFromHeaders();
  if (!resolution.ok || resolution.kind !== "tenant") {
    notFound();
  }
  return <TenantHubHome />;
}
