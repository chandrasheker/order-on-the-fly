"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, Card } from "@/components/ui";

export default function TenantSignupPage() {
  const [form, setForm] = useState({
    tenantName: "",
    tenantSlug: "",
    billingEmail: "",
    restaurantName: "",
    restaurantSlug: "",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "",
    tableCount: "8",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/tenant/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tableCount: Number(form.tableCount) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Signup failed");
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
        <Card className="max-w-lg w-full p-8 space-y-4">
          <h1 className="text-2xl font-bold text-emerald-400">Welcome to TableTap</h1>
          <p className="text-zinc-400">Your restaurant OS is ready.</p>
          <ul className="text-sm space-y-2 text-zinc-300">
            <li>
              <strong>Tenant:</strong> {String((result.tenant as { name?: string })?.name)}
            </li>
            <li>
              <strong>Restaurant:</strong> {String((result.restaurant as { name?: string })?.name)}
            </li>
            <li>
              <strong>Staff login:</strong> {String(result.ownerLogin)}
            </li>
          </ul>
          <div className="flex gap-3 pt-2">
            <Link href="/" className="flex-1">
              <Button className="w-full">Staff sign in</Button>
            </Link>
            <Link href="/platform/login" className="flex-1">
              <Button variant="secondary" className="w-full">
                Platform admin
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white py-12 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Start your Restaurant OS</h1>
          <p className="text-zinc-400 mt-2">Create a tenant, your first restaurant, branch, and owner account.</p>
        </div>

        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold text-violet-300">Organization (Tenant)</h2>
            <Input placeholder="Company / group name" value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })} required />
            <Input placeholder="Tenant slug (optional)" value={form.tenantSlug} onChange={(e) => setForm({ ...form, tenantSlug: e.target.value })} />
            <Input type="email" placeholder="Billing email" value={form.billingEmail} onChange={(e) => setForm({ ...form, billingEmail: e.target.value })} required />
          </Card>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold text-emerald-300">First restaurant</h2>
            <Input placeholder="Restaurant name" value={form.restaurantName} onChange={(e) => setForm({ ...form, restaurantName: e.target.value })} required />
            <Input placeholder="Restaurant slug (optional)" value={form.restaurantSlug} onChange={(e) => setForm({ ...form, restaurantSlug: e.target.value })} />
            <Input type="number" min={1} max={50} placeholder="Table count" value={form.tableCount} onChange={(e) => setForm({ ...form, tableCount: e.target.value })} />
          </Card>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold text-amber-300">Owner account</h2>
            <Input placeholder="Owner name" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} required />
            <Input type="email" placeholder="Owner email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} required />
            <Input type="password" placeholder="Password" value={form.ownerPassword} onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })} required minLength={8} />
          </Card>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating…" : "Create tenant & restaurant"}
          </Button>
        </form>

        <p className="text-center text-sm text-zinc-500">
          Already have an account? <Link href="/" className="text-violet-400 underline">Staff login</Link>
        </p>
      </div>
    </div>
  );
}
