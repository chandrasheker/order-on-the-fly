"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui";
import {
  BarChart3,
  ChefHat,
  ClipboardList,
  Gift,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Plug,
  Printer,
  QrCode,
  Radio,
  Utensils,
  X,
} from "lucide-react";
import {
  canAccessAdminMenu,
  canAccessFloorPlan,
  canAccessKitchen,
  canAccessReports,
} from "@/lib/staff-permissions";
import type { Role } from "@/generated/prisma/client";
import { swallowPollingFetchError } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

export type RestaurantNavId =
  | "dashboard"
  | "kitchen"
  | "floor"
  | "menu"
  | "qr"
  | "rewards"
  | "integrations"
  | "operations"
  | "realtime"
  | "printing"
  | "analytics"
  | "reports";

export type RestaurantShellUser = {
  name: string;
  role: Role;
  restaurantName: string;
  email?: string;
};

type FeatureFlags = Record<string, boolean | undefined>;

type NavItem = {
  id: RestaurantNavId;
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

interface RestaurantShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  full?: boolean;
  user?: RestaurantShellUser | null;
  features?: FeatureFlags;
  activeItem?: RestaurantNavId;
}

function flagOn(features: FeatureFlags | undefined, key: string) {
  return Boolean(features?.[key]);
}

function navFromPath(pathname: string): RestaurantNavId {
  if (pathname.startsWith("/admin/menu")) return "menu";
  if (pathname.startsWith("/admin/qr")) return "qr";
  if (pathname.startsWith("/admin/rewards")) return "rewards";
  if (pathname.startsWith("/admin/integrations")) return "integrations";
  if (pathname.startsWith("/admin/operations")) return "operations";
  if (pathname.startsWith("/admin/realtime")) return "realtime";
  if (pathname.startsWith("/admin/printing")) return "printing";
  if (pathname.startsWith("/admin/platform")) return "analytics";
  if (pathname.startsWith("/admin/reports")) return "reports";
  if (pathname.startsWith("/kitchen")) return "kitchen";
  if (pathname.startsWith("/staff/floor")) return "floor";
  return "dashboard";
}

function buildNav(role: Role | undefined, features: FeatureFlags | undefined): NavItem[] {
  const items: NavItem[] = [
    { id: "dashboard", href: "/staff/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ];
  if (role && canAccessKitchen(role) && flagOn(features, "kds")) {
    items.push({ id: "kitchen", href: "/kitchen", label: "Kitchen", icon: ChefHat });
  }
  if (role && canAccessFloorPlan(role) && flagOn(features, "floor_plan")) {
    items.push({ id: "floor", href: "/staff/floor", label: "Floor", icon: LayoutGrid });
  }
  if (!role || !canAccessAdminMenu(role)) {
    if (role && canAccessReports(role)) {
      items.push({ id: "reports", href: "/admin/reports", label: "Reports", icon: BarChart3 });
    }
    return items;
  }

  items.push(
    { id: "menu", href: "/admin/menu", label: "Menu", icon: Utensils },
    { id: "qr", href: "/admin/qr", label: "Tables & QR", icon: QrCode },
    { id: "rewards", href: "/admin/rewards", label: "Rewards", icon: Gift },
  );
  if (flagOn(features, "aggregator_inbox")) {
    items.push({ id: "integrations", href: "/admin/integrations", label: "Integrations", icon: Plug });
  }
  if (
    flagOn(features, "inventory_86") ||
    flagOn(features, "labor_clock") ||
    flagOn(features, "reservations") ||
    flagOn(features, "tip_pooling") ||
    flagOn(features, "guest_crm") ||
    flagOn(features, "audit_log")
  ) {
    items.push({ id: "operations", href: "/admin/operations", label: "Operations", icon: ClipboardList });
  }
  if (
    flagOn(features, "promotions_engine") ||
    flagOn(features, "menu_modifiers") ||
    flagOn(features, "call_waiter") ||
    flagOn(features, "kitchen_capacity") ||
    flagOn(features, "payment_webhooks") ||
    flagOn(features, "push_alerts")
  ) {
    items.push({ id: "realtime", href: "/admin/realtime", label: "Realtime", icon: Radio });
  }
  items.push(
    { id: "printing", href: "/admin/printing", label: "Printing", icon: Printer },
    { id: "analytics", href: "/admin/platform", label: "Analytics", icon: BarChart3 },
  );
  if (canAccessReports(role)) {
    items.push({ id: "reports", href: "/admin/reports", label: "Reports", icon: BarChart3 });
  }
  return items;
}

export function RestaurantShell({
  title,
  subtitle,
  children,
  actions,
  wide,
  full,
  user: userProp,
  features: featuresProp,
  activeItem,
}: RestaurantShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [fetchedUser, setFetchedUser] = useState<RestaurantShellUser | null>(null);
  const [fetchedFeatures, setFetchedFeatures] = useState<FeatureFlags>({});
  const [sessionResolved, setSessionResolved] = useState(false);

  useEffect(() => {
    if (userProp) return;
    let cancelled = false;
    void (async () => {
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (!meRes.ok) {
          router.push("/");
          return;
        }
        const me = await meRes.json();
        if (!me.user) {
          router.push("/");
          return;
        }
        const featuresRes = await fetch("/api/features", { credentials: "same-origin" });
        const featuresJson = featuresRes.ok ? await featuresRes.json() : {};
        if (cancelled) return;
        setFetchedUser({
          name: me.user.name,
          role: me.user.role,
          restaurantName: me.user.restaurantName,
          email: me.user.email,
        });
        setFetchedFeatures((featuresJson.enabled ?? {}) as FeatureFlags);
      } catch (error) {
        swallowPollingFetchError(error);
      } finally {
        if (!cancelled) setSessionResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, userProp]);

  const user = userProp ?? fetchedUser;
  const features = featuresProp ?? fetchedFeatures;
  const current = activeItem ?? navFromPath(pathname ?? "/staff/dashboard");
  const contentWidth = full ? "max-w-none" : wide ? "max-w-[88rem]" : "max-w-5xl";
  const navItems = useMemo(() => buildNav(user?.role, features), [features, user?.role]);

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      swallowPollingFetchError(error);
    }
    router.push("/");
  };

  const nav = (
    <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1" aria-label="Restaurant">
      {navItems.map(({ id, href, label, icon: Icon }) => {
        const active = current === id;
        return (
          <Link
            key={id}
            href={href}
            onClick={() => setMenuOpen(false)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              active
                ? "bg-orange-500/15 text-orange-900 dark:text-orange-100 border border-orange-500/30"
                : "text-muted border border-transparent hover:bg-white/5 hover:text-foreground",
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="px-4 py-4 border-b border-white/5">
      <p className="text-sm font-semibold text-foreground truncate">{user?.restaurantName || "TableTap"}</p>
      <p className="text-xs text-muted">Restaurant</p>
    </div>
  );

  const account = (
    <div className="mt-auto border-t border-white/5 px-4 py-4 space-y-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{user?.name ?? "Staff"}</p>
        <p className="text-xs text-muted truncate capitalize">{user?.role?.toLowerCase() ?? ""}</p>
        {user?.email ? <p className="text-xs text-muted truncate">{user.email}</p> : null}
      </div>
      <Button variant="secondary" size="sm" className="w-full justify-center" onClick={() => void logout()}>
        <LogOut className="w-4 h-4" /> Logout
      </Button>
    </div>
  );

  if (!userProp && !sessionResolved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-shell">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-shell text-foreground lg:flex">
      <aside className="hidden lg:flex lg:w-60 xl:w-64 shrink-0 flex-col border-r border-white/5 bg-black/20">
        {brand}
        {nav}
        {account}
      </aside>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative z-50 flex h-full w-72 max-w-[85vw] flex-col border-r border-white/10 bg-app-shell">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{user?.restaurantName || "TableTap"}</p>
                <p className="text-xs text-muted">Restaurant</p>
              </div>
              <button
                type="button"
                className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-white/5"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {nav}
            {account}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="border-b border-white/5 px-4 py-3 lg:px-6">
          <div className={`${contentWidth} mx-auto flex items-start justify-between gap-3`}>
            <div className="flex items-start gap-3 min-w-0">
              <button
                type="button"
                className="lg:hidden mt-0.5 p-2 rounded-lg bg-white/5 text-foreground hover:text-foreground"
                aria-label="Open navigation"
                onClick={() => setMenuOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold truncate">{title}</h1>
                {subtitle ? <p className="text-sm text-muted mt-0.5">{subtitle}</p> : null}
              </div>
            </div>
            <div className="header-trailing-actions flex flex-wrap items-center justify-end gap-2 shrink-0">
              {actions}
            </div>
          </div>
        </header>
        <main className={`${contentWidth} mx-auto px-4 py-5 lg:px-6`}>{children}</main>
      </div>
    </div>
  );
}
