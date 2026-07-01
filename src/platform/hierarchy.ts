/**
 * Tenant → Restaurant → Branch → Floor → Table hierarchy helpers.
 * All operational queries should use buildHierarchyScope() for consistent scoping.
 */
export type HierarchyScope = {
  tenantId: string;
  restaurantId: string;
  branchId?: string | null;
  floorId?: string | null;
};

export type HierarchyFields = {
  tenantId: string;
  restaurantId: string;
  branchId?: string | null;
  floorId?: string | null;
};

/** Prisma `where` fragment scoped to tenant + restaurant (+ optional branch/floor). */
export function buildHierarchyScope(scope: HierarchyScope, extra?: Record<string, unknown>) {
  const where: Record<string, unknown> = {
    tenantId: scope.tenantId,
    restaurantId: scope.restaurantId,
    ...extra,
  };
  if (scope.branchId) where.branchId = scope.branchId;
  if (scope.floorId) where.floorId = scope.floorId;
  return where;
}

/** Fields to stamp on create for any operational row. */
export function hierarchyStamp(scope: HierarchyScope): HierarchyFields {
  return {
    tenantId: scope.tenantId,
    restaurantId: scope.restaurantId,
    branchId: scope.branchId ?? null,
    floorId: scope.floorId ?? null,
  };
}

/** Narrow scope when branch/floor filter is active (staff session). */
export function narrowScope(
  base: HierarchyScope,
  filters?: { branchId?: string | null; floorId?: string | null },
): HierarchyScope {
  return {
    ...base,
    branchId: filters?.branchId ?? base.branchId,
    floorId: filters?.floorId ?? base.floorId,
  };
}
