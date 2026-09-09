"use client";

import type { ReactNode } from "react";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";

export default function KitchenLayout({ children }: { children: ReactNode }) {
  return (
    <RestaurantShell
      title="Kitchen"
      subtitle="Live tickets by category"
      wide
      full
      activeItem="kitchen"
    >
      {children}
    </RestaurantShell>
  );
}
