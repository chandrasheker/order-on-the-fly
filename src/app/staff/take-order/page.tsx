import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canPlaceOfflineOrder } from "@/lib/staff-permissions";
import { TakeOrderClient } from "./TakeOrderClient";

export const dynamic = "force-dynamic";

export default async function TakeOrderPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  if (!canPlaceOfflineOrder(session.role)) {
    redirect("/staff/dashboard");
  }
  return <TakeOrderClient />;
}
