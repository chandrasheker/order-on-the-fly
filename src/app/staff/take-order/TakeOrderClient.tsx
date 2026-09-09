"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TakeOrderOverlay } from "@/components/staff/TakeOrderOverlay";
import { Spinner } from "@/components/ui";
import { safeStaffReturnPath } from "@/lib/take-order-return";

function TakeOrderPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = safeStaffReturnPath(searchParams.get("from"));

  return (
    <TakeOrderOverlay
      onClose={() => {
        router.push(from);
      }}
    />
  );
}

export function TakeOrderClient() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      <TakeOrderPageInner />
    </Suspense>
  );
}
