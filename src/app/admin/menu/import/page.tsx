"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

type ImportSummary = {
  id: string;
  status: string;
  sourceType: string;
  sourceFileCount: number;
  createdAt: string;
};

export default function MenuImportUploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [recent, setRecent] = useState<ImportSummary[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/menu/imports");
      if (res.status === 401) {
        router.push("/staff");
        return;
      }
      const json = await res.json();
      setRecent(json.imports ?? []);
      setReady(true);
    })();
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length || uploading) return;
    setUploading(true);
    setError("");
    const body = new FormData();
    for (const file of files) body.append("files", file);
    const res = await fetch("/api/menu/imports", { method: "POST", body });
    const text = await res.text();
    let json: { error?: string; import?: { id: string } } = {};
    try {
      json = JSON.parse(text) as { error?: string; import?: { id: string } };
    } catch {
      json = {};
    }
    if (!res.ok) {
      setUploading(false);
      setError(
        json.error ||
          (res.status === 413
            ? "This file is too large. Each file must be 10 MB or smaller."
            : "Could not upload menu"),
      );
      return;
    }
    if (!json.import?.id) {
      setUploading(false);
      setError("Could not upload menu");
      return;
    }
    router.push(`/admin/menu/import/${json.import.id}`);
  };

  return (
    <div className="min-h-screen bg-app-shell text-foreground pb-10">
      <header className="border-b border-white/5 px-4 py-4 sticky top-0 z-30 bg-app-shell/95 backdrop-blur-md">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/admin/menu" className="p-2 rounded-xl bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Import Existing Menu</h1>
            <p className="text-sm text-zinc-400">PDF, JPG, JPEG, PNG or WebP — nothing goes live until you apply</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="rounded-xl px-4 py-3 text-sm bg-red-500/10 text-red-300 border border-red-500/30">
            {error}
          </div>
        )}

        <Card className="p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Upload className="w-5 h-5 text-amber-400" />
              Upload a menu
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              One PDF (including multi-page) or several photos of printed pages. Multiple images become one import,
              in the order you select them. Review every dish and price before Apply Import.
            </p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Input
              type="file"
              accept={ACCEPT}
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <ul className="text-sm text-zinc-400 space-y-1">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    {index + 1}. {file.name}
                  </li>
                ))}
              </ul>
            )}
            <Button type="submit" disabled={!files.length || uploading}>
              {uploading ? "Uploading…" : "Upload and extract"}
            </Button>
          </form>
        </Card>

        {recent.length > 0 && (
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold">Recent imports</h2>
            <div className="space-y-2">
              {recent.map((row) => (
                <Link
                  key={row.id}
                  href={`/admin/menu/import/${row.id}`}
                  className="block rounded-xl px-3 py-2 bg-white/5 hover:bg-white/10 text-sm"
                >
                  <span className="font-medium">{row.sourceType}</span>
                  <span className="text-zinc-500"> · {row.sourceFileCount} file(s) · {row.status}</span>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {!ready && (
          <div className="flex justify-center py-6">
            <Spinner className="w-6 h-6" />
          </div>
        )}
      </main>
    </div>
  );
}
