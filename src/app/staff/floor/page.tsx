import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canAccessFloorPlan } from "@/lib/staff-permissions";
import FloorClient from "./FloorClient";
import { FloorUnavailable } from "./FloorUnavailable";

export const dynamic = "force-dynamic";

export default async function FloorPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  if (!canAccessFloorPlan(session.role)) {
    return <FloorUnavailable reason="role" />;
  }

  const floor = await isFeatureEnabled(session.restaurantId, "floor_plan");
  if (!floor) {
    return <FloorUnavailable reason="feature" />;
  }

  return <FloorClient />;
}
