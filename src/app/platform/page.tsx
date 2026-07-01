"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Card, Input, Spinner } from "@/components/ui";
import { Building2, ChevronRight, Plus, Search } from "lucide-react";
import { PlatformShell } from "@/components/platform/PlatformShell";

type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  subscriptionStatus: string;
  billingEmail: string | null;
  restaurants: Array<{ id: string; name: string; slug: string }>;
};

export default function PlatformHomePage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const meRes = await fetch("/api/platform/auth/me");
    if (!meRes.ok) {
      router.push("/platform/login");
      return;
    }
    const me = await meRes.json();
    setAdmin(me.admin);

    const res = await fetch("/api/platform/tenants");
    if (res.ok) {
      const json = await res.json();
      const list = (json.tenants ?? []) as TenantSummary[];
      list.sort((a, b) => a.name.localeCompare(b.name));
      setTenants(list);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.billingEmail?.toLowerCase().includes(q),
    );
  }, [tenants, search]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-shell">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <PlatformShell
      admin={admin}
      title="TableTap Super Admin"
      subtitle="Select a tenant to manage its restaurants"
      actions={
        <Link
          href="/tenant/signup"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:text-white"
        >
          <Plus className="w-4 h-4" /> New tenant
        </Link>
      }
    >
      <div className="space-y-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenants by name or slug…"
            className="pl-10"
            aria-label="Search tenants"
          />
        </div>

        <p className="text-xs text-zinc-500">
          {search.trim()
            ? `${filtered.length} of ${tenants.length} tenant${tenants.length === 1 ? "" : "s"}`
            : `${tenants.length} tenant${tenants.length === 1 ? "" : "s"} total`}
        </p>

        {filtered.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-zinc-500">
              {search.trim() ? "No tenants match your search." : "No tenants yet."}
            </p>
            {!search.trim() && (
              <Link
                href="/tenant/signup"
                className="inline-block mt-4 text-sm text-violet-400 hover:text-violet-300"
              >
                Create the first tenant →
              </Link>
            )}
          </Card>
        )}

        <div className="grid gap-3">
          {filtered.map((tenant) => (
            <Link key={tenant.id} href={`/platform/tenants/${tenant.id}`} className="block group">
              <Card className="p-5 hover:border-violet-500/40 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold truncate group-hover:text-violet-200 transition-colors">
                        {tenant.name}
                      </h2>
                      <p className="text-sm text-zinc-500">{tenant.slug}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge className="bg-white/5 text-zinc-300 border-white/10">{tenant.plan}</Badge>
                        <Badge className="bg-white/5 text-zinc-400 border-white/10">
                          {tenant.subscriptionStatus}
                        </Badge>
                        <span className="text-xs text-zinc-500">
                          {tenant.restaurants.length} restaurant
                          {tenant.restaurants.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-violet-400 shrink-0 transition-colors" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </PlatformShell>
  );
}
