"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ChevronRight, LogOut, Shield } from "lucide-react";
import { swallowPollingFetchError } from "@/lib/client-fetch";

interface PlatformShellProps {
  admin: { name: string; email: string } | null;
  title: string;
  subtitle?: string;
  breadcrumb?: { label: string; href?: string }[];
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function PlatformShell({
  admin,
  title,
  subtitle,
  breadcrumb,
  children,
  actions,
}: PlatformShellProps) {
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
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-violet-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">{title}</h1>
              <p className="text-sm text-zinc-400 truncate">
                {subtitle ?? `${admin?.name} · ${admin?.email}`}
              </p>
            </div>
          </div>
          <div className="header-trailing-actions flex items-center gap-2 shrink-0">
            {actions}
            <Button variant="secondary" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4" /> Logout
            </Button>
          </div>
        </div>

        {breadcrumb && breadcrumb.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="max-w-5xl mx-auto px-4 mt-3 flex flex-wrap items-center gap-1 text-sm text-zinc-500"
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

      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
