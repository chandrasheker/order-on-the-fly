"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export function OofHeader() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#story", label: "How it works" },
    { href: "#service", label: "Service styles" },
    { href: "#ops", label: "Operations" },
    { href: "#capabilities", label: "Capabilities" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-orange-500/15 bg-[#140c08]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <Link href="/" className="text-xs uppercase tracking-[0.18em] text-orange-200/70 hover:text-orange-100">
            DVADTech
          </Link>
          <p className="truncate font-semibold text-white">Order-on-the-Fly</p>
        </div>
        <nav className="hidden items-center gap-5 text-sm text-orange-50/80 lg:flex" aria-label="Product">
          {links.map((item) => (
            <a key={item.href} href={item.href} className="hover:text-white">
              {item.label}
            </a>
          ))}
          <a href="#pilot" className="rounded-full bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950">
            Start a Pilot
          </a>
          <Link href="/oof/platform/login" className="hover:text-white">
            Platform Login
          </Link>
        </nav>
        <button
          type="button"
          className="lg:hidden rounded-lg border border-white/10 p-2 text-white"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>
      {open ? (
        <nav className="lg:hidden border-t border-white/8 px-4 py-3 space-y-1 text-sm">
          {links.map((item) => (
            <a key={item.href} href={item.href} className="block px-2 py-2" onClick={() => setOpen(false)}>
              {item.label}
            </a>
          ))}
          <a href="#pilot" className="block px-2 py-2" onClick={() => setOpen(false)}>
            Start a Pilot
          </a>
          <Link href="/oof/platform/login" className="block px-2 py-2" onClick={() => setOpen(false)}>
            Platform Login
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
