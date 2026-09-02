import Link from "next/link";

export function ApexLanding({
  hostname,
  baseDomain,
}: {
  hostname: string;
  baseDomain: string;
}) {
  const exampleHost = baseDomain ? `{slug}.${baseDomain}` : "{slug}.{TENANT_BASE_DOMAIN}";
  const exampleUrl = baseDomain ? `https://fp-north.${baseDomain}` : "https://fp-north.example.com";
  const platformLogin = baseDomain ? `https://${baseDomain}/platform/login` : "/platform/login";

  return (
    <div className="min-h-screen bg-app-shell flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">{hostname || "apex"}</p>
          <h1 className="text-2xl font-bold text-foreground mt-1">TableTap</h1>
          <p className="text-sm text-zinc-400 mt-2">
            Restaurant staff login, kitchen, and guest ordering live on the restaurant
            subdomain — not on this apex host.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-300 space-y-2">
          <p>
            Open <code className="text-orange-300">{exampleHost}</code> for that restaurant.
          </p>
          <p className="text-zinc-500">
            Example:{" "}
            <code className="text-zinc-300">{exampleUrl}</code>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href={platformLogin}
            className="flex-1 text-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 px-4 py-2.5 text-sm font-medium text-white"
          >
            Platform admin
          </Link>
          <Link
            href="/tenant/signup"
            className="flex-1 text-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-zinc-200"
          >
            Tenant signup
          </Link>
        </div>
      </div>
    </div>
  );
}
