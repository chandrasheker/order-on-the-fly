"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  CreditCard,
  LayoutGrid,
  LogOut,
  Menu,
  ScrollText,
  Shield,
  Store,
  X,
} from "lucide-react";
import { swallowPollingFetchError } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

export type PlatformNavId = "overview" | "tenants" | "restaurants" | "billing" | "audit" | "logs";

const NAV: { id: PlatformNavId; href: string; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", href: "/platform", label: "Overview", icon: LayoutGrid },
  { id: "tenants", href: "/platform?view=tenants", label: "Tenants", icon: Building2 },
  { id: "restaurants", href: "/platform?view=fleet", label: "Restaurants", icon: Store },
  { id: "billing", href: "/platform/billing", label: "Billing", icon: CreditCard },
  { id: "audit", href: "/platform/audit", label: "Audit", icon: Shield },
  { id: "logs", href: "/platform/logs", label: "Logs", icon: ScrollText },
];

interface PlatformShellProps {
  admin: { name: string; email: string } | null;
  title: string;
  subtitle?: string;
  breadcrumb?: { label: string; href?: string }[];
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  activeItem?: PlatformNavId;
}

function navFromPath(pathname: string): PlatformNavId {
  if (pathname.startsWith("/platform/billing")) return "billing";
  if (pathname.startsWith("/platform/logs")) return "logs";
  if (pathname.startsWith("/platform/audit")) return "audit";
  if (pathname.includes("/restaurants/")) return "restaurants";
  if (pathname.startsWith("/platform/tenants")) return "tenants";
  return "overview";
}

export function PlatformSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-foreground">{title}</h2>
        {description ? <p className="text-xs text-muted mt-1">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function PlatformShell({
  admin,
  title,
  subtitle,
  breadcrumb,
  backHref,
  backLabel,
  children,
  actions,
  wide,
  activeItem,
}: PlatformShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = activeItem ?? navFromPath(pathname ?? "/platform");
  const contentWidth = wide ? "max-w-[88rem]" : "max-w-5xl";

  const logout = async () => {
    try {
      await fetch("/api/platform/auth/logout", { method: "POST" });
    } catch (error) {
      swallowPollingFetchError(error);
    }
    router.push("/platform/login");
  };

  const nav = (
    <nav className="flex-1 px-3 py-3 space-y-1" aria-label="Platform">
      {NAV.map(({ id, href, label, icon: Icon }) => {
        const active = current === id;
        return (
          <Link
            key={id}
            href={href}
            onClick={() => setMenuOpen(false)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              active
                ? "bg-violet-500/15 text-violet-900 dark:text-violet-100 border border-violet-500/30"
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
      <p className="text-sm font-semibold text-foreground">TableTap</p>
      <p className="text-xs text-muted">Platform</p>
    </div>
  );

  const account = (
    <div className="mt-auto border-t border-white/5 px-4 py-4 space-y-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{admin?.name ?? "Platform Admin"}</p>
        <p className="text-xs text-muted truncate">{admin?.email ?? ""}</p>
      </div>
      <Button variant="secondary" size="sm" className="w-full justify-center" onClick={() => void logout()}>
        <LogOut className="w-4 h-4" /> Logout
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen max-w-full overflow-x-clip bg-app-shell text-foreground lg:flex">
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
              <div>
                <p className="text-sm font-semibold text-foreground">TableTap</p>
                <p className="text-xs text-muted">Platform</p>
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
        <header className="sticky top-0 z-30 border-b border-white/5 bg-app-shell/95 backdrop-blur-md px-4 py-3 lg:px-6">
          <div className={`${contentWidth} mx-auto flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <button
                type="button"
                className="lg:hidden mt-0.5 p-2 rounded-lg bg-white/5 text-foreground hover:text-foreground"
                aria-label="Open navigation"
                onClick={() => setMenuOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                {breadcrumb && breadcrumb.length > 0 && (
                  <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                    {breadcrumb.map((item, i) => (
                      <span key={`${item.label}-${i}`} className="flex items-center gap-1 min-w-0">
                        {i > 0 && <ChevronRight className="w-3 h-3 shrink-0" />}
                        {item.href ? (
                          <Link href={item.href} className="hover:text-violet-800 dark:hover:text-violet-300 truncate max-w-[10rem] sm:max-w-none">
                            {item.label}
                          </Link>
                        ) : (
                          <span className="text-muted truncate max-w-[10rem] sm:max-w-none">{item.label}</span>
                        )}
                      </span>
                    ))}
                  </nav>
                )}
                <div className="flex items-center gap-2 min-w-0">
                  {backHref ? (
                    <Link
                      href={backHref}
                      aria-label={backLabel ?? "Back"}
                      title={backLabel ?? "Back"}
                      className="inline-flex w-8 h-8 rounded-lg bg-white/5 items-center justify-center shrink-0 hover:bg-white/10"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </Link>
                  ) : null}
                  <h1 className="text-xl font-semibold truncate">{title}</h1>
                </div>
                {subtitle ? <p className="text-sm text-muted mt-0.5 line-clamp-2">{subtitle}</p> : null}
              </div>
            </div>
            <div className="header-trailing-actions flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto min-w-0">
              {actions}
            </div>
          </div>
        </header>
        <main className={`${contentWidth} mx-auto min-w-0 px-4 py-5 lg:px-6`}>{children}</main>
      </div>
    </div>
  );
}
