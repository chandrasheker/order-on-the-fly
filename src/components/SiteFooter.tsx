"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

const CONTACT_PHONE = "8904685843";
const CONTACT_TEL = "+918904685843";

export function SiteFooter() {
  const year = new Date().getFullYear();
  const [contactVisible, setContactVisible] = useState(false);

  const revealContact = useCallback(() => {
    setContactVisible(true);
  }, []);

  useEffect(() => {
    if (contactVisible) return;

    const onScroll = () => {
      if (window.scrollY > 24) {
        setContactVisible(true);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [contactVisible]);

  return (
    <footer
      className="relative z-10 mt-auto border-t border-[color:var(--surface-border)] bg-[color:var(--footer-bg)] backdrop-blur-sm"
      role="contentinfo"
    >
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p className="text-xs text-[color:var(--muted)] text-center sm:text-left">
            © {year}{" "}
            <span className="text-[color:var(--foreground)] font-medium">DVAD Technologies</span>. All rights
            reserved.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5 text-xs text-[color:var(--muted)] text-center sm:text-right">
            <div className="flex items-center justify-center sm:justify-end gap-2">
              <span className="hidden sm:inline">Theme</span>
              <ThemeToggle />
            </div>
            <p>
              Powered by{" "}
              <span className="text-[color:var(--foreground)] font-medium">DVAD Tech</span>
            </p>

            {!contactVisible ? (
              <>
                <span className="hidden sm:inline text-zinc-700" aria-hidden>
                  |
                </span>
                <button
                  type="button"
                  onClick={revealContact}
                  className="text-orange-400/90 hover:text-orange-300 transition-colors underline-offset-2 hover:underline"
                >
                  Contact
                </button>
              </>
            ) : (
              <>
                <span className="hidden sm:inline text-zinc-700" aria-hidden>
                  |
                </span>
                <p className="transition-opacity duration-300">
                  Contact:{" "}
                  <Link
                    href={`tel:${CONTACT_TEL}`}
                    className="text-orange-400/90 hover:text-orange-300 transition-colors whitespace-nowrap"
                  >
                    {CONTACT_PHONE}
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
