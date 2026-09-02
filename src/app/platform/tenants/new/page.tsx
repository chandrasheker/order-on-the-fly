"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { PlatformCreateTenantForm } from "@/components/platform/PlatformCreateTenantForm";

export default function NewTenantPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [baseDomain, setBaseDomain] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/platform/auth/me");
      if (!me.ok) {
        router.push("/platform/login");
        return;
      }
      setAdmin((await me.json()).admin);
      const tenants = await fetch("/api/platform/tenants");
      if (tenants.ok) {
        const json = await tenants.json();
        setBaseDomain(String(json.tenantBaseDomain ?? ""));
      }
      setLoading(false);
    })();
  }, [router]);

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
      title="New tenant"
      subtitle="Create a tenant and one or more restaurants. Hostnames are generated for you."
      backHref="/platform"
      backLabel="All tenants"
    >
      <PlatformCreateTenantForm baseDomain={baseDomain} />
    </PlatformShell>
  );
}
