"use client";

import type { ReactNode } from "react";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";

export default function TakeOrderLayout({ children }: { children: ReactNode }) {
  return (
    <RestaurantShell
      title="Take Order"
      subtitle="Pick dishes on the left. The cart on the right updates as you go."
      wide
      full
    >
      {children}
    </RestaurantShell>
  );
}
