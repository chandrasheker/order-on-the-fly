"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const NAV = [
  { href: "#products", label: "Products" },
  { href: "#solve", label: "What We Solve" },
  { href: "#approach", label: "Approach" },
  { href: "#about", label: "About" },
];

export function CompanyHeader() {
  const [open, setOpen] = useState(false);
  const contact = (process.env.NEXT_PUBLIC_DVADTECH_CONTACT_URL ?? "").trim();

  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-[#07080d]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <a href="#top" className="font-semibold tracking-tight text-white">
          DVADTech
        </a>
        <nav className="hidden items-center gap-6 text-sm text-zinc-300 md:flex" aria-label="Company">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="hover:text-white transition-colors">
              {item.label}
            </a>
          ))}
          <Link href="/oof" className="hover:text-white transition-colors">
            Order-on-the-Fly
          </Link>
          {contact ? (
            <a
              href={contact}
              className="rounded-full border border-white/15 px-3 py-1.5 text-white hover:bg-white/5"
            >
              Contact
            </a>
          ) : (
            <a href="#explore" className="rounded-full border border-white/15 px-3 py-1.5 text-white hover:bg-white/5">
              Explore
            </a>
          )}
        </nav>
        <button
          type="button"
          className="md:hidden rounded-lg border border-white/10 p-2 text-white"
          aria-expanded={open}
          aria-label="Open menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>
      {open ? (
        <nav className="md:hidden border-t border-white/8 px-4 py-3 space-y-2 text-sm" aria-label="Mobile">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block rounded-lg px-2 py-2 text-zinc-200"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <Link href="/oof" className="block rounded-lg px-2 py-2 text-zinc-200" onClick={() => setOpen(false)}>
            Order-on-the-Fly
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
