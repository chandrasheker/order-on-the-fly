"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ArrowLeft, ChevronRight, LogOut, Shield } from "lucide-react";
import { swallowPollingFetchError } from "@/lib/client-fetch";

interface PlatformShellProps {
  admin: { name: string; email: string } | null;
  title: string;
  subtitle?: string;
  breadcrumb?: { label: string; href?: string }[];
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  wide?: boolean;
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
}: PlatformShellProps) {
  const shellWidth = wide ? "max-w-7xl" : "max-w-5xl";
  const router = useRouter();

  const logout = async () => {
    try {
      await fetch("/api/platform/auth/logout", { method: "POST" });
    } catch (error) {
      swallowPollingFetchError(error);
    }
    router.push("/platform/login");
  };

  return (
    <div className="min-h-screen bg-app-shell text-foreground">
      <header className="border-b border-white/5 px-4 py-4">
        <div className={`${shellWidth} mx-auto flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-3 min-w-0">
            {backHref ? (
              <Link
                href={backHref}
                aria-label={backLabel ?? "Back"}
                title={backLabel ?? "Back"}
                className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0 hover:bg-white/10 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-violet-400" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">{title}</h1>
              <p className="text-sm text-zinc-400 truncate">
                {subtitle ?? `${admin?.name} · ${admin?.email}`}
              </p>
            </div>
          </div>
          <div className="header-trailing-actions flex items-center gap-2 shrink-0">
            <Link
              href="/platform/logs"
              className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-xl text-sm font-medium border bg-white/5 border-white/10 hover:text-white"
            >
              Platform Logs
            </Link>
            {actions}
            <Button variant="secondary" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4" /> Logout
            </Button>
          </div>
        </div>

        {breadcrumb && breadcrumb.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className={`${shellWidth} mx-auto px-4 mt-3 flex flex-wrap items-center gap-1 text-sm text-zinc-500`}
          >
            {breadcrumb.map((item, i) => (
              <span key={`${item.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5" />}
                {item.href ? (
                  <Link href={item.href} className="hover:text-violet-300 transition-colors">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-zinc-300">{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
      </header>

      <main className={`${shellWidth} mx-auto px-4 py-6`}>{children}</main>
    </div>
  );
}
