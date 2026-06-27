"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  QrCode,
  Clock,
  Bell,
  BarChart3,
  Gamepad2,
  ChefHat,
  Sparkles,
  ArrowRight,
  Zap,
  Users,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui";

const features = [
  {
    icon: QrCode,
    title: "Scan & Order",
    desc: "Customers scan table QR codes and order instantly — no app download needed.",
    color: "from-orange-500 to-amber-500",
  },
  {
    icon: Timer,
    title: "Smart Timers",
    desc: "Auto prep-time tracking per item. Water in 1 min, biryani in 20 — all automatic.",
    color: "from-rose-500 to-pink-500",
  },
  {
    icon: Bell,
    title: "Instant Alerts",
    desc: "Missed a deadline? Every staff member gets notified instantly. No order falls through.",
    color: "from-red-500 to-orange-500",
  },
  {
    icon: Gamepad2,
    title: "Wait Games",
    desc: "Spin wheels, trivia, memory games — customers stay entertained while food cooks.",
    color: "from-purple-500 to-violet-500",
  },
  {
    icon: BarChart3,
    title: "Daily Reports",
    desc: "Download detailed CSV reports. Track revenue, popular items, and table performance.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: Users,
    title: "Team Roles",
    desc: "Owner, manager, cook, server — each role sees exactly what they need.",
    color: "from-blue-500 to-cyan-500",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#08080f] text-white overflow-hidden">
      {/* Hero */}
      <div className="relative">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-orange-600/20 via-rose-600/10 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-3xl" />
        </div>

        <nav className="relative max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <ChefHat className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold">TableTap</span>
          </div>
          <Link href="/staff/login">
            <Button variant="secondary" size="sm">
              Staff Login
            </Button>
          </Link>
        </nav>

        <div className="relative max-w-6xl mx-auto px-4 pt-16 pb-24 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-orange-300 mb-6">
              <Sparkles className="w-4 h-4" />
              The future of table-side ordering
              <Zap className="w-4 h-4" />
            </div>

            <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6">
              <span className="bg-gradient-to-r from-white via-white to-zinc-400 bg-clip-text text-transparent">
                Orders fly in.
              </span>
              <br />
              <span className="bg-gradient-to-r from-orange-400 via-rose-400 to-purple-400 bg-clip-text text-transparent">
                Service flies out.
              </span>
            </h1>

            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              QR-powered table ordering with smart prep timers, real-time staff alerts,
              wait-time games, and beautiful daily reports. Your restaurant, supercharged.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/staff/login">
                <Button size="lg" className="text-base px-8">
                  Launch Dashboard <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link href="/order/spice-garden/demo">
                <Button variant="secondary" size="lg" className="text-base px-8">
                  Try Demo Menu
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Floating preview cards */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="mt-16 grid md:grid-cols-3 gap-4 max-w-4xl mx-auto"
          >
            {[
              { label: "Table 7", item: "2x Masala Dosa", time: "8:42", status: "Preparing", color: "border-orange-500/30" },
              { label: "Table 3", item: "Chicken Biryani", time: "OVERDUE", status: "Alert!", color: "border-red-500/50 animate-pulse" },
              { label: "Table 1", item: "Masala Chai × 2", time: "0:00", status: "Ready!", color: "border-emerald-500/30" },
            ].map((card) => (
              <div
                key={card.label}
                className={`p-4 rounded-2xl bg-white/5 border ${card.color} backdrop-blur-xl text-left`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold">{card.label}</span>
                  <span className={`text-xs font-mono ${card.time === "OVERDUE" ? "text-red-400" : "text-zinc-400"}`}>
                    {card.time}
                  </span>
                </div>
                <p className="text-sm text-zinc-400">{card.item}</p>
                <p className="text-xs mt-2 text-orange-400">{card.status}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Everything your restaurant needs
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Built for owners who want less chaos and more control — without the complexity.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              viewport={{ once: true }}
              className="group p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all hover:bg-white/[0.05]"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                <f.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 py-24 border-t border-white/5">
        <h2 className="text-3xl font-bold text-center mb-16">How it works</h2>
        <div className="grid md:grid-cols-4 gap-8">
          {[
            { step: "01", title: "Print QR Codes", desc: "Generate & print unique QR codes for each table" },
            { step: "02", title: "Customer Scans", desc: "Guests scan, browse menu, add to cart & order" },
            { step: "03", title: "Kitchen Gets It", desc: "Staff see orders live with smart prep timers" },
            { step: "04", title: "Serve & Track", desc: "Mark served, get alerts, download reports" },
          ].map((s) => (
            <div key={s.step} className="text-center">
              <div className="text-4xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent mb-3">
                {s.step}
              </div>
              <h3 className="font-bold mb-2">{s.title}</h3>
              <p className="text-sm text-zinc-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 py-24 text-center">
        <div className="p-12 rounded-3xl bg-gradient-to-br from-orange-600/20 via-rose-600/10 to-purple-600/20 border border-white/10">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to wow your customers?
          </h2>
          <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
            Demo restaurant &quot;Spice Garden&quot; is pre-loaded with 10 tables, 30+ menu items, and staff accounts.
          </p>
          <Link href="/staff/login">
            <Button size="lg" className="text-base px-10">
              Get Started Free <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <p className="text-xs text-zinc-500 mt-4">
            Demo login: owner@spicegarden.com / admin123
          </p>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-sm text-zinc-500">
        <p>TableTap — Smart Restaurant Ordering SaaS</p>
      </footer>
    </div>
  );
}
