"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { ImagePlus } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { notifyLogoChanged, readApiErrorMessage } from "@/lib/admin-api-error";

export function RestaurantLogoCard() {
  const [logoUrl, setLogoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    void fetch("/api/branding/logo")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json?.settings) return;
        setLogoUrl(json.settings.logoUrl ?? "");
      });
  }, []);

  const uploadLogo = async (file: File) => {
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/branding/logo/upload", {
        method: "POST",
        body: formData,
      });
      const json = res.ok ? await res.json() : null;
      if (!res.ok) {
        setMessage({
          type: "err",
          text: await readApiErrorMessage(res, "Upload failed."),
        });
        return;
      }
      const nextUrl = json.settings.logoUrl ?? "";
      setLogoUrl(nextUrl);
      notifyLogoChanged(nextUrl || null);
      setMessage({ type: "ok", text: json.message || "Logo uploaded." });
    } catch {
      setMessage({ type: "err", text: "Upload failed. Please try again." });
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    setRemoving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/branding/logo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: json.error || "Could not remove logo." });
        return;
      }
      setLogoUrl("");
      notifyLogoChanged(null);
      setMessage({ type: "ok", text: "Restaurant logo removed." });
    } catch {
      setMessage({ type: "err", text: "Could not remove logo. Please try again." });
    } finally {
      setRemoving(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadLogo(file);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <ImagePlus className="w-5 h-5 text-orange-400" />
        <h2 className="text-lg font-bold">Restaurant logo</h2>
      </div>
      <p className="text-sm text-[color:var(--muted)] mb-4">
        Upload the restaurant logo. After upload it stays on the top left next to the restaurant
        name in staff pages, and on the guest ordering page.
      </p>

      {message && (
        <p
          className={`text-sm mb-4 ${message.type === "ok" ? "text-emerald-400" : "text-red-400"}`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="inline-flex">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={uploading || removing}
            onChange={handleFileChange}
          />
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium cursor-pointer">
            {uploading ? "Uploading..." : "Choose logo image"}
          </span>
        </label>
        {logoUrl.trim() && (
          <Button variant="secondary" onClick={() => void removeLogo()} disabled={uploading || removing}>
            {removing ? "Removing..." : "Remove logo"}
          </Button>
        )}
      </div>

      {logoUrl.trim() ? (
        <div className="inline-flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
          <img
            key={logoUrl}
            src={logoUrl}
            alt="Restaurant logo preview"
            className="h-14 w-14 rounded-lg object-contain bg-white p-1"
          />
          <p className="text-sm text-muted">Shows beside the restaurant name</p>
        </div>
      ) : (
        <p className="text-sm text-[color:var(--muted)]">No restaurant logo uploaded yet.</p>
      )}
    </Card>
  );
}
