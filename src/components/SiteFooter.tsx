import Link from "next/link";

const CONTACT_NAME = "ChandraShekhar";
const CONTACT_PHONE = "8904685843";
const CONTACT_TEL = "+918904685843";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="relative z-10 mt-auto border-t border-white/5 bg-[#06060c]/95 backdrop-blur-sm"
      role="contentinfo"
    >
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p className="text-xs text-zinc-500 text-center sm:text-left">
            © {year}{" "}
            <span className="text-zinc-400 font-medium">DVAD Technologies</span>. All rights
            reserved.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5 text-xs text-zinc-500 text-center sm:text-right">
            <p>
              Powered by{" "}
              <span className="text-zinc-300 font-medium">DVAD Tech</span>
            </p>
            <span className="hidden sm:inline text-zinc-700" aria-hidden>
              |
            </span>
            <p>
              Contact:{" "}
              <span className="text-zinc-400">{CONTACT_NAME}</span>
              {" · "}
              <Link
                href={`tel:${CONTACT_TEL}`}
                className="text-orange-400/90 hover:text-orange-300 transition-colors whitespace-nowrap"
              >
                {CONTACT_PHONE}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
