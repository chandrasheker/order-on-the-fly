import { notFound } from "next/navigation";
import { resolveTenantFromHeaders } from "@/platform/host-tenant";

/**
 * Fails closed for restaurant-shaped hosts that do not resolve
 * (unknown subdomain, disabled restaurant/tenant, broken hierarchy).
 * Reserved hosts (apex, localhost, platform) pass through.
 */
export async function HostTenantGate({ children }: { children: React.ReactNode }) {
  try {
    const resolution = await resolveTenantFromHeaders();
    if (!resolution.ok) {
      notFound();
    }
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
  }
  return children;
}
