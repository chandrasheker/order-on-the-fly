"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Spinner, Badge } from "@/components/ui";
import { LogOut, Shield, Save } from "lucide-react";
import type { Role } from "@/generated/prisma/client";

interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  restaurantName: string;
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "OWNER", label: "Owner" },
  { value: "MANAGER", label: "Manager" },
  { value: "COOK", label: "Cook" },
  { value: "SERVER", label: "Staff / Server" },
];

export default function PlatformUsersPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; email: string; password: string; role: Role }>
  >({});
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const [meRes, usersRes] = await Promise.all([
      fetch("/api/platform/auth/me"),
      fetch("/api/platform/users"),
    ]);

    if (!meRes.ok) {
      router.push("/platform/login");
      return;
    }

    const me = await meRes.json();
    setAdmin(me.admin);

    if (usersRes.ok) {
      const data = await usersRes.json();
      setUsers(data.users);
      const nextDrafts: typeof drafts = {};
      for (const u of data.users as StaffUser[]) {
        nextDrafts[u.id] = {
          name: u.name,
          email: u.email,
          password: "",
          role: u.role,
        };
      }
      setDrafts(nextDrafts);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const logout = async () => {
    await fetch("/api/platform/auth/logout", { method: "POST" });
    router.push("/platform/login");
  };

  const saveUser = async (userId: string) => {
    const draft = drafts[userId];
    if (!draft) return;

    setSavingId(userId);
    setMessage(null);

    const body: Record<string, string> = {
      userId,
      name: draft.name,
      email: draft.email,
      role: draft.role,
    };
    if (draft.password.trim()) {
      body.password = draft.password;
    }

    const res = await fetch("/api/platform/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...data.user } : u)));
      setDrafts((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          name: data.user.name,
          email: data.user.email,
          role: data.user.role,
          password: "",
        },
      }));
      setMessage({ type: "ok", text: `Saved ${data.user.name}` });
    } else {
      const data = await res.json();
      setMessage({ type: "err", text: data.error || "Save failed" });
    }
    setSavingId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a12]">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      <header className="border-b border-white/5 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Staff accounts</h1>
              <p className="text-sm text-zinc-400">
                {admin?.name} · {admin?.email}
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={logout}>
            <LogOut className="w-4 h-4" /> Logout
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <p className="text-sm text-zinc-400">
          Update display names, login emails, passwords, and roles for owner, manager, cook, and
          server accounts.
        </p>

        {message && (
          <p
            className={`text-sm text-center ${
              message.type === "ok" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {message.text}
          </p>
        )}

        {users.map((user) => {
          const draft = drafts[user.id];
          if (!draft) return null;

          return (
            <Card key={user.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-violet-500/15 text-violet-300 border-violet-500/30">
                  {user.restaurantName}
                </Badge>
                <span className="text-xs text-zinc-500 capitalize">{user.role.toLowerCase()}</span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Display name</label>
                  <Input
                    value={draft.name}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [user.id]: { ...prev[user.id], name: e.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Login email</label>
                  <Input
                    type="email"
                    value={draft.email}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [user.id]: { ...prev[user.id], email: e.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">New password</label>
                  <Input
                    type="password"
                    placeholder="Leave blank to keep current"
                    value={draft.password}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [user.id]: { ...prev[user.id], password: e.target.value },
                      }))
                    }
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Role</label>
                  <select
                    value={draft.role}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [user.id]: { ...prev[user.id], role: e.target.value as Role },
                      }))
                    }
                    className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-zinc-900">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => saveUser(user.id)}
                disabled={savingId === user.id}
                className="w-full sm:w-auto"
              >
                {savingId === user.id ? (
                  <Spinner />
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Save changes
                  </>
                )}
              </Button>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
