"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { PlatformScopedLogsConsole } from "@/components/platform/PlatformScopedLogsConsole";
import { swallowPollingFetchError } from "@/lib/client-fetch";

export default function PlatformLogsPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [initialPreset, setInitialPreset] = useState("all");
  const [initialFingerprint, setInitialFingerprint] = useState<string | undefined>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInitialPreset(params.get("preset") ?? "all");
    setInitialFingerprint(params.get("errorFingerprint") ?? undefined);
    void fetch("/api/platform/auth/me")
      .then(async (res) => {
        if (!res.ok) {
          router.push("/platform/login");
          return;
        }
        const json = await res.json();
        setAdmin(json.admin);
      })
      .catch(swallowPollingFetchError);
  }, [router]);

  if (!admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-shell">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <PlatformShell
      wide
      admin={admin}
      title="Platform Logs"
      subtitle="Append-only forensic evidence with no tenant or restaurant business scope"
      backHref="/platform"
      backLabel="Command center"
      breadcrumb={[{ label: "Command center", href: "/platform" }, { label: "Platform Logs" }]}
    >
      <PlatformScopedLogsConsole
        endpoint="/api/platform/logs"
        initialPreset={initialPreset}
        initialFingerprint={initialFingerprint}
        title="Platform-level events"
        subtitle="Only events where tenantId and restaurantId are both empty — PlatformAdmin auth, global configuration, unsupported hosts, and forensic integrity."
      />
    </PlatformShell>
  );
}
