import { publicCustomerHostScope } from "@/platform/tenant-scope";
import type { HostTenantResolution } from "@/platform/host-tenant";
import type { AuthenticatedPrinterAgent } from "@/lib/printer-agent-service";

export function agentMatchesRestaurantHost(
  agent: AuthenticatedPrinterAgent,
  resolution: HostTenantResolution,
) {
  const scope = publicCustomerHostScope(resolution);
  if (!scope.ok) return false;
  if (scope.requireRestaurant && scope.restaurantId !== agent.restaurantId) return false;
  return true;
}
