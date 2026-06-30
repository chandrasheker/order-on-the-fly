"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plug, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui";

export function AggregatorInboxBanner() {
  const [status, setStatus] = useState<{
    swiggy?: string;
    zomato?: string;
    anyLive: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/integrations/aggregators")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.connections) return;
        const map = Object.fromEntries(
          data.connections.map((c: { platform: string; status: string }) => [c.platform, c.status])
        );
        setStatus({
          swiggy: map.SWIGGY,
          zomato: map.ZOMATO,
          anyLive: map.SWIGGY === "CONNECTED" || map.ZOMATO === "CONNECTED",
        });
      })
      .catch(() => undefined);
  }, []);

  if (!status) return null;

  return (
    <div className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Plug className="w-5 h-5 text-orange-300 mt-0.5" />
        <div>
          <p className="font-medium text-orange-100">Swiggy & Zomato — automatic orders</p>
          <p className="text-sm text-zinc-400 mt-1">
            {status.anyLive
              ? "Connected platforms push orders straight to the kitchen board. No manual entry."
              : "Save outlet credentials once in Admin → Integrations. After partner activation, orders flow automatically."}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge className="bg-orange-500/15 text-orange-300 border-orange-500/30">
              Swiggy: {status.swiggy?.replaceAll("_", " ").toLowerCase() ?? "—"}
            </Badge>
            <Badge className="bg-red-500/15 text-red-300 border-red-500/30">
              Zomato: {status.zomato?.replaceAll("_", " ").toLowerCase() ?? "—"}
            </Badge>
          </div>
        </div>
      </div>
      <Link
        href="/admin/integrations"
        className="inline-flex items-center gap-2 text-sm text-orange-300 hover:text-orange-200"
      >
        Configure <ExternalLink className="w-4 h-4" />
      </Link>
    </div>
  );
}
