"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { PlatformScopedLogsConsole } from "@/components/platform/PlatformScopedLogsConsole";
import { swallowPollingFetchError } from "@/lib/client-fetch";

function PlatformLogsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
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
        initialPreset={searchParams.get("preset") ?? "all"}
        initialFingerprint={searchParams.get("errorFingerprint") ?? undefined}
        title="Platform-level events"
        subtitle="Only events where tenantId and restaurantId are both empty — PlatformAdmin auth, global configuration, unsupported hosts, and forensic integrity."
      />
    </PlatformShell>
  );
}

export default function PlatformLogs() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-app-shell">
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      <PlatformLogsPage />
    </Suspense>
  );
}
