import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import FloorClient from "./FloorClient";

export default async function FloorPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  const floor = await isFeatureEnabled(session.restaurantId, "floor_plan");
  if (!floor) {
    redirect("/staff/dashboard");
  }

  return <FloorClient />;
}
