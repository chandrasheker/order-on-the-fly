"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui";
import { Activity, Landmark, LayoutGrid, ScrollText, Users } from "lucide-react";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { PlatformScopedLogsConsole } from "@/components/platform/PlatformScopedLogsConsole";
import { TimeRangeBar } from "@/components/platform/command-center-shared";
import { RestaurantDetailPanels } from "@/components/platform/PlatformCommandPanels";
import { cn } from "@/lib/utils";
import { swallowPollingFetchError } from "@/lib/client-fetch";
import type { CommandCenterPayload } from "@/platform/command-center/types";

type RestaurantTab = "overview" | "operations" | "financial" | "staff" | "logs";

const TABS: { id: RestaurantTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "operations", label: "Operations", icon: Activity },
  { id: "financial", label: "Financial", icon: Landmark },
  { id: "staff", label: "Staff", icon: Users },
  { id: "logs", label: "Logs", icon: ScrollText },
];

function PlatformRestaurantCommand() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const tenantId = String(params.tenantId ?? "");
  const restaurantId = String(params.restaurantId ?? "");
  const initialTab = (searchParams.get("tab") as RestaurantTab) || "overview";
  const [tab, setTab] = useState<RestaurantTab>(TABS.some((item) => item.id === initialTab) ? initialTab : "overview");
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [command, setCommand] = useState<CommandCenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const range = searchParams.get("range") || "today";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const replaceParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`/platform/tenants/${tenantId}/restaurants/${restaurantId}?${next.toString()}`);
  };

  const load = useCallback(async () => {
    try {
      const meRes = await fetch("/api/platform/auth/me");
      if (!meRes.ok) {
        router.push("/platform/login");
        return;
      }
      setAdmin((await meRes.json()).admin);
      const query = new URLSearchParams({ range });
      if (range === "custom" && from && to) {
        query.set("from", from);
        query.set("to", to);
      }
      const res = await fetch(`/api/platform/tenants/${tenantId}/restaurants/${restaurantId}/command?${query.toString()}`);
      if (!res.ok) {
        router.push(`/platform/tenants/${tenantId}`);
        return;
      }
      setCommand((await res.json()) as CommandCenterPayload);
    } catch (error) {
      swallowPollingFetchError(error);
    } finally {
      setLoading(false);
    }
  }, [from, range, restaurantId, router, tenantId, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform fetch-on-mount
    void load();
  }, [load]);

  if (loading || !command?.restaurants[0]) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-shell">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const row = command.restaurants[0];
  const tenantName = command.tenant?.name ?? row.tenantName;

  return (
    <PlatformShell
      wide
      admin={admin}
      title={row.restaurantName}
      subtitle={`${tenantName} · fleet visibility, not the restaurant /admin app`}
      backHref={`/platform/tenants/${tenantId}`}
      backLabel={tenantName}
      breadcrumb={[
        { label: "Command center", href: "/platform" },
        { label: tenantName, href: `/platform/tenants/${tenantId}` },
        { label: row.restaurantName },
      ]}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2 border-b border-white/5 pb-4">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                replaceParams({ tab: id });
              }}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border",
                tab === id
                  ? "bg-violet-500/20 border-violet-500/40 text-violet-200"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:text-white",
              )}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab !== "logs" && (
          <TimeRangeBar
            range={range}
            from={from}
            to={to}
            onRange={(value) => replaceParams({ range: value, from: value === "custom" ? from : null, to: value === "custom" ? to : null })}
            onCustom={(nextFrom, nextTo) => replaceParams({ range: "custom", from: nextFrom, to: nextTo })}
          />
        )}

        {tab === "logs" ? (
          <PlatformScopedLogsConsole
            endpoint={`/api/platform/tenants/${tenantId}/restaurants/${restaurantId}/logs`}
            initialPreset={searchParams.get("preset") ?? "all"}
            initialFingerprint={searchParams.get("errorFingerprint") ?? undefined}
            failedOnly={searchParams.get("failedOnly") === "1"}
            ambiguousOnly={searchParams.get("ambiguousOnly") === "1"}
            title="Restaurant logs"
            subtitle="Same PlatformAuditEvent store, forced to this restaurant after verifying it belongs to the tenant."
          />
        ) : (
          <RestaurantDetailPanels row={row} tab={tab} focus={searchParams.get("focus") ?? undefined} />
        )}
      </div>
    </PlatformShell>
  );
}

export default function PlatformRestaurantPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-app-shell">
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      <PlatformRestaurantCommand />
    </Suspense>
  );
}
