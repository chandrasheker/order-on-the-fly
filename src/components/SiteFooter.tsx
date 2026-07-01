"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const CONTACT_PHONE = "8904685843";
const CONTACT_TEL = "+918904685843";

export function SiteFooter({ embedded = false }: { embedded?: boolean }) {
  const year = new Date().getFullYear();
  const [contactVisible, setContactVisible] = useState(embedded);

  const revealContact = useCallback(() => {
    setContactVisible(true);
  }, []);

  useEffect(() => {
    if (contactVisible || embedded) return;

    const onScroll = () => {
      if (window.scrollY > 24) {
        setContactVisible(true);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [contactVisible, embedded]);

  if (embedded) {
    return (
      <footer
        className="shrink-0 border-t border-[color:var(--surface-border)] bg-[color:var(--footer-bg)] backdrop-blur-sm"
        role="contentinfo"
      >
        <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] sm:text-xs text-[color:var(--muted)]">
          <p className="truncate">
            © {year}{" "}
            <span className="text-[color:var(--foreground)] font-medium">DVAD Technologies</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 shrink-0">
            <p>
              Powered by{" "}
              <span className="text-[color:var(--foreground)] font-medium">DVAD Tech</span>
            </p>
            {!contactVisible ? (
              <button
                type="button"
                onClick={revealContact}
                className="text-orange-400/90 hover:text-orange-300 transition-colors underline-offset-2 hover:underline"
              >
                Contact
              </button>
            ) : (
              <Link
                href={`tel:${CONTACT_TEL}`}
                className="text-orange-400/90 hover:text-orange-300 transition-colors whitespace-nowrap"
              >
                {CONTACT_PHONE}
              </Link>
            )}
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer
      className="site-footer-global relative z-10 mt-auto border-t border-[color:var(--surface-border)] bg-[color:var(--footer-bg)] backdrop-blur-sm"
      role="contentinfo"
    >
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p className="text-xs text-[color:var(--muted)] text-center sm:text-left">
            © {year}{" "}
            <span className="text-[color:var(--foreground)] font-medium">DVAD Technologies</span>. All rights
            reserved.
          </p>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-4 gap-y-2 text-xs text-[color:var(--muted)] text-center sm:text-right">
            <p className="shrink-0">
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
