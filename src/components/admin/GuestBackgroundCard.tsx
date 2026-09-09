"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { ImageIcon } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { readApiErrorMessage } from "@/lib/admin-api-error";

export function GuestBackgroundCard() {
  const [backgroundImageUrl, setBackgroundImageUrl] = useState("");
  const [backgroundEnabled, setBackgroundEnabled] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [removingBackground, setRemovingBackground] = useState(false);
  const [backgroundMessage, setBackgroundMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    void fetch("/api/branding/background")
      .then((res) => (res.ok ? res.json() : null))
      .then((brandingData) => {
        if (!brandingData?.settings) return;
        setBackgroundImageUrl(brandingData.settings.backgroundImageUrl ?? "");
        setBackgroundEnabled(Boolean(brandingData.settings.enabled));
      });
  }, []);

  const uploadBackground = async (file: File) => {
    setUploadingBackground(true);
    setBackgroundMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/branding/background/upload", {
        method: "POST",
        body: formData,
      });
      const json = res.ok ? await res.json() : null;
      if (!res.ok) {
        setBackgroundMessage({
          type: "err",
          text: await readApiErrorMessage(res, "Upload failed."),
        });
        return;
      }
      setBackgroundImageUrl(json.settings.backgroundImageUrl ?? "");
      setBackgroundMessage({ type: "ok", text: json.message || "Background uploaded." });
    } catch {
      setBackgroundMessage({ type: "err", text: "Upload failed. Please try again." });
    } finally {
      setUploadingBackground(false);
    }
  };

  const removeBackground = async () => {
    setRemovingBackground(true);
    setBackgroundMessage(null);
    try {
      const res = await fetch("/api/branding/background", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backgroundImageUrl: null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setBackgroundMessage({ type: "err", text: json.error || "Could not remove background." });
        return;
      }
      setBackgroundImageUrl("");
      setBackgroundMessage({ type: "ok", text: "Guest background removed." });
    } catch {
      setBackgroundMessage({ type: "err", text: "Could not remove background. Please try again." });
    } finally {
      setRemovingBackground(false);
    }
  };

  const handleBackgroundFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadBackground(file);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <ImageIcon className="w-5 h-5 text-sky-400" />
        <h2 className="text-lg font-bold">Guest page background</h2>
        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
          Premium
        </span>
      </div>
      <p className="text-sm text-[color:var(--muted)] mb-4">
        Upload a photo from your device to show behind the customer ordering screen. Guests see
        it on the table QR menu page. This is separate from the restaurant logo.
      </p>

      {!backgroundEnabled ? (
        <p className="text-sm text-amber-400/90 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          Custom background is not enabled for this restaurant yet. Contact your platform admin
          or run{" "}
          <code className="text-orange-300">enable-premium-features.ts --features custom_background</code>.
        </p>
      ) : (
        <>
          {backgroundMessage && (
            <p
              className={`text-sm mb-4 ${
                backgroundMessage.type === "ok" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {backgroundMessage.text}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="inline-flex">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                disabled={uploadingBackground || removingBackground}
                onChange={handleBackgroundFileChange}
              />
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium cursor-pointer disabled:opacity-50">
                {uploadingBackground ? "Uploading..." : "Choose background image"}
              </span>
            </label>
            {backgroundImageUrl.trim() && (
              <Button
                variant="secondary"
                onClick={() => void removeBackground()}
                disabled={uploadingBackground || removingBackground}
              >
                {removingBackground ? "Removing..." : "Remove background"}
              </Button>
            )}
          </div>

          {backgroundImageUrl.trim() ? (
            <div className="relative overflow-hidden rounded-xl border border-[color:var(--surface-border)] max-w-md">
              <img
                key={backgroundImageUrl}
                src={backgroundImageUrl}
                alt="Guest page background preview"
                className="w-full h-40 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <p className="absolute bottom-2 left-3 text-xs text-white/90">Customer preview</p>
            </div>
          ) : (
            <p className="text-sm text-[color:var(--muted)]">No guest background uploaded yet.</p>
          )}
        </>
      )}
    </Card>
  );
}
