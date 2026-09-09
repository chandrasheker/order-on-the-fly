"use client";

import type { ReactNode } from "react";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";

export default function FloorLayout({ children }: { children: ReactNode }) {
  return (
    <RestaurantShell
      title="Floor"
      subtitle="Server assignment · guest count · live bill"
      wide
      full
      activeItem="floor"
    >
      {children}
    </RestaurantShell>
  );
}
