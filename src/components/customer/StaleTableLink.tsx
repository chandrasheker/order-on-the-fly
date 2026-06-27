import Link from "next/link";
import { QrCode, RefreshCw } from "lucide-react";

export function StaleTableLink({
  slug,
  token,
}: {
  slug: string;
  token: string;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] text-white p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center mx-auto">
          <QrCode className="w-7 h-7 text-amber-400" />
        </div>
        <h1 className="text-xl font-bold">This table link is no longer valid</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          The QR code or bookmark you used is from an older database reset. Table links
          change when the database is reset unless you use the stable URLs below.
        </p>
        <p className="text-xs text-zinc-500 font-mono break-all">{token}</p>
        <div className="flex flex-col gap-2 pt-2">
          <Link
            href={`/order/${slug}/demo`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 px-4 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Open Table 1 (demo)
          </Link>
          <Link
            href={`/order/${slug}/${slug}-table-1`}
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Or use stable link: /order/{slug}/{slug}-table-1
          </Link>
        </div>
        <p className="text-xs text-zinc-500 pt-2">
          Staff: re-print QR codes from Admin → QR Codes after a database reset.
        </p>
      </div>
    </div>
  );
}
