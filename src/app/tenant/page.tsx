import { Suspense } from "react";
import { notFound } from "next/navigation";
import { resolveTenantFromHeaders } from "@/platform/host-tenant";
import { resolveTenantAdminHostContext } from "@/lib/tenant-admin-host";
import { TenantHubHome } from "@/components/tenant/TenantHubHome";
import { Spinner } from "@/components/ui";

export default async function TenantHubPage() {
  const resolution = await resolveTenantFromHeaders();
  const host = await resolveTenantAdminHostContext(resolution);
  if (!host) {
    notFound();
  }
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-app-shell">
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      <TenantHubHome />
    </Suspense>
  );
}
