"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { UtensilsCrossed } from "lucide-react";

function storageKey(tableToken: string) {
  return `tabletap-session-${tableToken}`;
}

function getOrCreateSessionKey(tableToken: string) {
  const key = storageKey(tableToken);
  let sessionKey = sessionStorage.getItem(key);
  if (!sessionKey) {
    sessionKey = crypto.randomUUID();
    sessionStorage.setItem(key, sessionKey);
  }
  return sessionKey;
}

export function TableCheckInClient({
  slug,
  token,
  accessCode,
  initialMessage = "Verifying your table…",
  expired = false,
}: {
  slug: string;
  token: string;
  accessCode: string;
  initialMessage?: string;
  expired?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState(initialMessage);

  const runCheckIn = useCallback(async () => {
    if (expired) return;

    const sessionKey = getOrCreateSessionKey(token);
    try {
      const res = await fetch("/api/tables/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tableToken: token, sessionKey, accessCode }),
      });
      const data = await res.json();
      if (res.ok) {
        router.replace(`/order/${slug}/${token}`);
        return;
      }
      setMessage(data.error || "Could not check in to this table.");
    } catch {
      setMessage("Network error. Please scan the QR code again.");
    }
  }, [accessCode, expired, router, slug, token]);

  useEffect(() => {
    void runCheckIn();
  }, [runCheckIn]);

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <UtensilsCrossed className="w-10 h-10 text-orange-400 mx-auto" />
        {!expired && <Spinner className="w-8 h-8 mx-auto" />}
        <p className="text-zinc-300">{message}</p>
        {message !== "Verifying your table…" && (
          <p className="text-sm text-zinc-500">
            {expired
              ? "This link was time-limited. Use the physical QR code on your table to get a fresh link."
              : "Ask your server to enable ordering for your table, then scan the QR code again."}
          </p>
        )}
      </div>
    </div>
  );
}
