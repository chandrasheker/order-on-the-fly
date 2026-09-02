import { notFound } from "next/navigation";
import { resolveTenantFromHeaders } from "@/platform/host-tenant";
import { TenantAdminLoginForm } from "@/components/tenant/TenantAdminLoginForm";

export default async function TenantAdminLoginPage() {
  const resolution = await resolveTenantFromHeaders();
  if (!resolution.ok || resolution.kind !== "tenant") {
    notFound();
  }
  return (
    <TenantAdminLoginForm
      tenantName={resolution.tenant.tenantName}
      tenantSlug={resolution.tenant.tenantSlug}
    />
  );
}
