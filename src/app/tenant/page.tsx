import { notFound } from "next/navigation";
import { resolveTenantFromHeaders } from "@/platform/host-tenant";
import { resolveTenantAdminHostContext } from "@/lib/tenant-admin-host";
import { TenantHubHome } from "@/components/tenant/TenantHubHome";

export default async function TenantHubPage() {
  const resolution = await resolveTenantFromHeaders();
  const host = await resolveTenantAdminHostContext(resolution);
  if (!host) {
    notFound();
  }
  return <TenantHubHome />;
}
