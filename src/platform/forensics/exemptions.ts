/**
 * Business API routes must use withForensicApiRoute unless listed here
 * with a specific reason. Do not add directory wildcards.
 */
export const FORENSIC_ROUTE_EXEMPTIONS: Record<string, string> = {
  "src/app/api/health/route.ts": "health check",
  "src/app/api/menu/media/[itemId]/route.ts": "public immutable menu media delivery",
};
