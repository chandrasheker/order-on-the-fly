"use client";

export function KitchenPausedBanner({
  paused,
  message,
}: {
  paused: boolean;
  message?: string | null;
}) {
  if (!paused) return null;

  return (
    <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-center space-y-1">
      <p className="font-semibold text-amber-300">Kitchen at capacity</p>
      <p className="text-sm text-zinc-400">
        {message ??
          "New orders are paused briefly while the kitchen catches up. Please ask your server."}
      </p>
    </div>
  );
}
