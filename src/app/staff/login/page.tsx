"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Input, Spinner } from "@/components/ui";
import { ChefHat, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      router.push("/staff/dashboard");
    } else {
      const data = await res.json();
      setError(data.error || "Login failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/25">
              <ChefHat className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Staff Login</h1>
            <p className="text-sm text-zinc-400 mt-1">TableTap Command Center</p>
          </div>

          <form onSubmit={login} className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1.5 block">Email</label>
              <Input
                type="email"
                placeholder="owner@restaurant.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1.5 block">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? <Spinner /> : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 p-3 rounded-xl bg-white/5 border border-white/10">
            <p className="text-xs text-zinc-500 text-center">Demo credentials</p>
            <p className="text-xs text-zinc-400 text-center mt-1 font-mono">
              owner@spicegarden.com / admin123
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
