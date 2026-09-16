import { Suspense } from "react";
import { StaffDashboard } from "@/components/staff/StaffDashboard";
import { Spinner } from "@/components/ui";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-app-shell">
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      <StaffDashboard />
    </Suspense>
  );
}
