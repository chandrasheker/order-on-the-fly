"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { Building2 } from "lucide-react";

export function TenantAdminLoginForm({
  tenantName,
  tenantSlug,
}: {
  tenantName: string;
  tenantSlug: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tenant-admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Invalid email or password");
        return;
      }
      router.push("/tenant");
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-shell flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-violet-500/20 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-7 h-7 text-violet-300" />
          </div>
          <h1 className="text-2xl font-bold">{tenantName}</h1>
          <p className="text-sm text-zinc-400 mt-1">Tenant admin · {tenantSlug}</p>
        </div>
        <form onSubmit={(e) => void login(e)} className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
