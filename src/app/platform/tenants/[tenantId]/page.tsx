"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { PlatformTenantWorkspace } from "@/components/platform/PlatformTenantWorkspace";

export default function PlatformTenantPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-app-shell">
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      <PlatformTenantWorkspace />
    </Suspense>
  );
}
