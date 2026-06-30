import Link from "next/link";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui";

export function FloorUnavailable({
  reason,
}: {
  reason: "feature" | "role";
}) {
  const message =
    reason === "feature"
      ? "Floor plan is not enabled for this restaurant yet."
      : "Your role does not have access to the floor plan.";

  return (
    <div className="min-h-screen bg-app-shell text-foreground flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface)] p-8">
        <LayoutGrid className="w-10 h-10 text-violet-400 mx-auto" />
        <h1 className="text-xl font-bold">Floor plan unavailable</h1>
        <p className="text-sm text-[color:var(--muted)]">{message}</p>
        {reason === "feature" && (
          <p className="text-xs text-[color:var(--muted)]">
            Ask your platform admin to enable the{" "}
            <code className="text-orange-300">floor_plan</code> premium feature, then refresh.
          </p>
        )}
        <Link href="/staff/dashboard">
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
