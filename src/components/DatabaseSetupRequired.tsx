import Link from "next/link";
import { Button } from "@/components/ui";

export function DatabaseSetupRequired() {
  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-6">
        <div className="text-5xl">🛠️</div>
        <h1 className="text-2xl font-bold">Database not initialized</h1>
        <p className="text-zinc-400 leading-relaxed">
          The app database has not been set up yet. Run the setup command in your
          project folder, then refresh this page.
        </p>
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-left">
          <code className="text-sm text-orange-300 block">npm run db:setup</code>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <Button variant="secondary">Back to Home</Button>
          </Link>
          <Link href="/staff/login">
            <Button>Staff Login</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
