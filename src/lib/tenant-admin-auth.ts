import type { NextRequest } from "next/server";
import { loadTenantAdminSession, TENANT_ADMIN_COOKIE } from "@/lib/auth";
import { resolveTenantAdminHostContext } from "@/lib/tenant-admin-host";
import { resolveTenantFromHost } from "@/platform/host-tenant";
import { AUDIT_ACTOR_TYPE } from "@/platform/forensics/constants";
import { setForensicActor, setForensicTenant } from "@/platform/forensics/request-context";

/**
 * TenantAdmin gate for API routes. Reads host + cookie from the request so
 * tests can exercise the same path as the browser, and tenant identity still
 * comes from hostname/DB — never from a client-supplied tenantId.
 */
export async function requireTenantAdminFromRequest(req: NextRequest) {
  const resolution = await resolveTenantFromHost(req.headers);
  const host = await resolveTenantAdminHostContext(resolution);
  if (!host) return null;
  const session = await loadTenantAdminSession(req.cookies.get(TENANT_ADMIN_COOKIE)?.value);
  if (!session || session.tenantId !== host.tenantId) return null;
  setForensicActor({
    type: AUDIT_ACTOR_TYPE.TENANT_ADMIN,
    id: session.id,
    name: session.name,
    role: "TENANT_ADMIN",
  });
  setForensicTenant({ tenantId: session.tenantId });
  return { session, tenant: host };
}
