"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";

function adminPageMeta(pathname: string) {
  if (pathname.startsWith("/admin/menu/import")) {
    return {
      title: "Import menu",
      subtitle: "Review a draft before anything is added to the live menu",
    };
  }
  if (pathname.startsWith("/admin/menu")) {
    return {
      title: "Menu",
      subtitle: "Categories and items for the QR menu and digital boards",
    };
  }
  if (pathname.startsWith("/admin/qr")) {
    return { title: "Tables & QR", subtitle: "Dine-in table codes and guest page" };
  }
  if (pathname.startsWith("/admin/rewards")) {
    return { title: "Rewards", subtitle: "Verify name and mark redeemed" };
  }
  if (pathname.startsWith("/admin/integrations")) {
    return { title: "Integrations", subtitle: "Swiggy and Zomato automatic sync" };
  }
  if (pathname.startsWith("/admin/operations")) {
    return { title: "Operations", subtitle: "Inventory, labor, reservations, tips, CRM, audit" };
  }
  if (pathname.startsWith("/admin/realtime")) {
    return { title: "Realtime", subtitle: "Promotions, modifiers, kitchen, payments, alerts" };
  }
  if (pathname.startsWith("/admin/printing")) {
    return { title: "Printing", subtitle: "Agents, queue, retry delivery" };
  }
  if (pathname.startsWith("/admin/platform")) {
    return { title: "Analytics", subtitle: "Forecasts, API keys, recipes, branches" };
  }
  if (pathname.startsWith("/admin/reports")) {
    return { title: "Reports", subtitle: "Daily sales and item breakdown" };
  }
  return { title: "Restaurant", subtitle: undefined };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const meta = adminPageMeta(pathname);
  return (
    <RestaurantShell title={meta.title} subtitle={meta.subtitle} wide>
      {children}
    </RestaurantShell>
  );
}
