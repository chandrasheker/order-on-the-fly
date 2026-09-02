import { notFound } from "next/navigation";
import { resolveTenantFromHeaders } from "@/platform/host-tenant";

/**
 * Fails closed for restaurant-shaped hosts that do not resolve
 * (unknown subdomain, disabled restaurant/tenant, broken hierarchy).
 * Reserved hosts (apex, localhost, platform) and tenant hubs pass through.
 * Resolver/DB failures propagate (500) — they must not render the app.
 */
export async function HostTenantGate({ children }: { children: React.ReactNode }) {
  const resolution = await resolveTenantFromHeaders();
  if (!resolution.ok) {
    notFound();
  }
  return children;
}
