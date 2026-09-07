import { notFound } from "next/navigation";
import { resolveTenantFromHeaders } from "@/platform/host-tenant";
import { resolveTenantAdminHostContext } from "@/lib/tenant-admin-host";
import { TenantAdminLoginForm } from "@/components/tenant/TenantAdminLoginForm";

export default async function TenantAdminLoginPage() {
  const resolution = await resolveTenantFromHeaders();
  const host = await resolveTenantAdminHostContext(resolution);
  if (!host) {
    notFound();
  }
  return (
    <TenantAdminLoginForm
      tenantName={host.tenantName}
      tenantSlug={host.tenantSlug}
    />
  );
}
