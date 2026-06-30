import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import KitchenClient from "./KitchenClient";

export default async function KitchenPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  const kds = await isFeatureEnabled(session.restaurantId, "kds");
  if (!kds) {
    redirect("/staff/dashboard");
  }

  return <KitchenClient />;
}
