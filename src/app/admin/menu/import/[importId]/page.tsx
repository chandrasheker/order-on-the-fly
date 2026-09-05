"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";

type DraftItem = {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number | null;
  priceAmbiguous: boolean;
  isVeg: boolean | null;
  prepTimeMinutes?: number;
  skipOnApply?: boolean;
  sourcePage?: number;
  possibleDuplicate?: boolean;
  reviewFlags?: string[];
};

type DraftCategory = {
  id: string;
  name: string;
  items: DraftItem[];
};

type ImportRecord = {
  id: string;
  status: string;
  sourceType: string;
  sourceFileCount: number;
  pageCount: number | null;
  draft: { categories: DraftCategory[] } | null;
  errorMessage: string | null;
  applyPreview?: {
    categoryCount: number;
    itemCount: number;
    duplicateCount: number;
    incompleteCount: number;
  };
  appliedResult?: {
    createdCategoryCount: number;
    createdItemCount: number;
    skippedDuplicateCount: number;
  } | null;
};

const STATUS_LABEL: Record<string, string> = {
  UPLOADED: "Uploading",
  PROCESSING: "Processing",
  READY_FOR_REVIEW: "Ready for review",
  FAILED: "Failed",
  APPLYING: "Applying",
  APPLIED: "Applied",
  CANCELLED: "Cancelled",
};

function rupeesFromPaise(paise: number | null) {
  if (paise == null) return "";
  return String(paise / 100);
}

function paiseFromRupees(value: string): { paise: number | null; ambiguous: boolean } {
  const trimmed = value.trim();
  if (!trimmed) return { paise: null, ambiguous: false };
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { paise: null, ambiguous: true };
  const [whole, frac = ""] = trimmed.split(".");
  return { paise: Number(whole) * 100 + Number((frac + "00").slice(0, 2)), ambiguous: false };
}

export default function MenuImportReviewPage() {
  const params = useParams<{ importId: string }>();
  const router = useRouter();
  const importId = params.importId;
  const [record, setRecord] = useState<ImportRecord | null>(null);
  const [draft, setDraft] = useState<{ categories: DraftCategory[] }>({ categories: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [saveState, setSaveState] = useState("");

  const applyRecord = useCallback((next: ImportRecord | null) => {
    if (!next) return;
    setRecord(next);
    if (next.draft) setDraft(next.draft);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/menu/imports/${importId}`);
    if (res.status === 401) {
      router.push("/staff");
      return null;
    }
    if (res.status === 404) {
      setError("Not found");
      return null;
    }
    const json = await res.json();
    applyRecord(json.import);
    return json.import as ImportRecord;
  }, [applyRecord, importId, router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/menu/imports/${importId}`);
      if (cancelled) return;
      if (res.status === 401) {
        router.push("/staff");
        return;
      }
      if (res.status === 404) {
        setError("Not found");
        return;
      }
      const json = await res.json();
      if (!cancelled) applyRecord(json.import);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyRecord, importId, router]);

  useEffect(() => {
    if (!record || (record.status !== "UPLOADED" && record.status !== "PROCESSING")) return;
    const timer = window.setInterval(() => {
      void load();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [record, load]);

  const persist = async (next: { categories: DraftCategory[] }) => {
    setDraft(next);
    setSaveState("Saving…");
    const res = await fetch(`/api/menu/imports/${importId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: next }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaveState("");
      setError(json.error || "Could not save draft");
      return;
    }
    setRecord(json.import);
    if (json.import?.draft) setDraft(json.import.draft);
    setSaveState("Saved");
  };

  const preview = record?.applyPreview;
  const confirmLabel = useMemo(() => {
    const cats = preview?.categoryCount ?? 0;
    const items = preview?.itemCount ?? 0;
    return `Create ${cats} categories and ${items} menu items?`;
  }, [preview]);

  const apply = async () => {
    if (busy) return;
    if (!confirm(confirmLabel)) return;
    setBusy("apply");
    setError("");
    const res = await fetch(`/api/menu/imports/${importId}/apply`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(json.error || "Could not apply import");
      return;
    }
    setRecord(json.import);
    router.push("/admin/menu");
  };

  const cancel = async () => {
    if (busy) return;
    if (!confirm("Cancel this import? The live menu will not change.")) return;
    setBusy("cancel");
    const res = await fetch(`/api/menu/imports/${importId}/cancel`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(json.error || "Could not cancel");
      return;
    }
    setRecord(json.import);
  };

  const retry = async () => {
    if (busy) return;
    setBusy("retry");
    const res = await fetch(`/api/menu/imports/${importId}/process`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(json.error || "Could not retry");
      return;
    }
    await load();
  };

  if (!record && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-shell">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const editable = record?.status === "READY_FOR_REVIEW";

  return (
    <div className="min-h-screen bg-app-shell text-foreground pb-10">
      <header className="border-b border-white/5 px-4 py-4 sticky top-0 z-30 bg-app-shell/95 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/admin/menu" className="p-2 rounded-xl bg-white/5 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Review Imported Menu</h1>
            <p className="text-sm text-zinc-400">
              {STATUS_LABEL[record?.status ?? ""] ?? record?.status} · {record?.sourceType} ·{" "}
              {record?.pageCount ?? record?.sourceFileCount} page(s)
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="rounded-xl px-4 py-3 text-sm bg-red-500/10 text-red-300 border border-red-500/30">
            {error}
          </div>
        )}
        {saveState && editable && <p className="text-xs text-zinc-500">{saveState}</p>}
        {record?.errorMessage && record.status === "FAILED" && (
          <div className="rounded-xl px-4 py-3 text-sm bg-red-500/10 text-red-300 border border-red-500/30">
            {record.errorMessage}
          </div>
        )}

        {(record?.status === "UPLOADED" || record?.status === "PROCESSING") && (
          <Card className="p-6 flex items-center gap-3">
            <Spinner className="w-5 h-5" />
            <p>Extracting a review draft. This does not change your live menu.</p>
          </Card>
        )}

        {record?.status === "FAILED" && (
          <div className="flex gap-2">
            <Button type="button" onClick={() => void retry()} disabled={Boolean(busy)}>
              Retry extraction
            </Button>
            <Button type="button" variant="secondary" onClick={() => void cancel()} disabled={Boolean(busy)}>
              Cancel Import
            </Button>
          </div>
        )}

        {editable && (
          <>
            {draft.categories.map((category, categoryIndex) => (
              <Card key={category.id} className="p-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={category.name}
                    onChange={(e) => {
                      const next = structuredClone(draft);
                      next.categories[categoryIndex].name = e.target.value;
                      setDraft(next);
                    }}
                    onBlur={() => void persist(draft)}
                  />
                  <button
                    type="button"
                    className="p-2 rounded-lg text-zinc-500 hover:text-red-400"
                    onClick={() => {
                      const next = {
                        categories: draft.categories.filter((row) => row.id !== category.id),
                      };
                      void persist(next);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {category.items.map((item, itemIndex) => {
                  const warn = item.priceAmbiguous || item.pricePaise == null || item.possibleDuplicate;
                  return (
                    <div
                      key={item.id}
                      className={`grid gap-2 rounded-xl p-3 ${warn ? "bg-amber-500/10" : "bg-white/5"}`}
                    >
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>{item.possibleDuplicate ? "! possible duplicate" : "✓"}</span>
                        {item.sourcePage ? <span>page {item.sourcePage}</span> : null}
                        {item.priceAmbiguous || item.pricePaise == null ? <span>₹???</span> : null}
                      </div>
                      <div className="grid sm:grid-cols-[1fr_7rem_7rem_6rem_auto] gap-2">
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const next = structuredClone(draft);
                            next.categories[categoryIndex].items[itemIndex].name = e.target.value;
                            setDraft(next);
                          }}
                          onBlur={() => void persist(draft)}
                        />
                        <Input
                          placeholder="₹"
                          value={rupeesFromPaise(item.pricePaise)}
                          onChange={(e) => {
                            const parsed = paiseFromRupees(e.target.value);
                            const next = structuredClone(draft);
                            next.categories[categoryIndex].items[itemIndex].pricePaise = parsed.paise;
                            next.categories[categoryIndex].items[itemIndex].priceAmbiguous = parsed.ambiguous;
                            setDraft(next);
                          }}
                          onBlur={() => void persist(draft)}
                        />
                        <select
                          className="rounded-xl bg-black/30 border border-white/10 px-2 text-sm"
                          value={item.isVeg == null ? "" : item.isVeg ? "veg" : "nonveg"}
                          onChange={(e) => {
                            const next = structuredClone(draft);
                            next.categories[categoryIndex].items[itemIndex].isVeg =
                              e.target.value === "" ? null : e.target.value === "veg";
                            void persist(next);
                          }}
                        >
                          <option value="">Veg?</option>
                          <option value="veg">Veg</option>
                          <option value="nonveg">Non-veg</option>
                        </select>
                        <Input
                          type="number"
                          min={1}
                          placeholder="Prep"
                          value={item.prepTimeMinutes ?? 10}
                          onChange={(e) => {
                            const next = structuredClone(draft);
                            next.categories[categoryIndex].items[itemIndex].prepTimeMinutes =
                              parseInt(e.target.value, 10) || 10;
                            setDraft(next);
                          }}
                          onBlur={() => void persist(draft)}
                        />
                        <button
                          type="button"
                          className="p-2 rounded-lg text-zinc-500 hover:text-red-400"
                          onClick={() => {
                            const next = structuredClone(draft);
                            next.categories[categoryIndex].items = next.categories[categoryIndex].items.filter(
                              (row) => row.id !== item.id,
                            );
                            void persist(next);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <Input
                        placeholder="Description (optional)"
                        value={item.description ?? ""}
                        onChange={(e) => {
                          const next = structuredClone(draft);
                          next.categories[categoryIndex].items[itemIndex].description = e.target.value || null;
                          setDraft(next);
                        }}
                        onBlur={() => void persist(draft)}
                      />
                      <div className="flex flex-wrap gap-2 items-center text-sm">
                        <label className="text-zinc-400">Move to</label>
                        <select
                          className="rounded-lg bg-black/30 border border-white/10 px-2 py-1"
                          value={category.id}
                          onChange={(e) => {
                            const targetId = e.target.value;
                            const next = structuredClone(draft);
                            const [moved] = next.categories[categoryIndex].items.splice(itemIndex, 1);
                            const target = next.categories.find((row) => row.id === targetId);
                            target?.items.push(moved);
                            void persist(next);
                          }}
                        >
                          {draft.categories.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.name}
                            </option>
                          ))}
                        </select>
                        {item.possibleDuplicate && (
                          <label className="flex items-center gap-2 text-amber-200">
                            <input
                              type="checkbox"
                              checked={item.skipOnApply !== false}
                              onChange={(e) => {
                                const next = structuredClone(draft);
                                next.categories[categoryIndex].items[itemIndex].skipOnApply = e.target.checked;
                                void persist(next);
                              }}
                            />
                            Skip existing item
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const next = structuredClone(draft);
                    next.categories[categoryIndex].items.push({
                      id: `item-new-${Date.now()}`,
                      name: "",
                      description: null,
                      pricePaise: null,
                      priceAmbiguous: false,
                      isVeg: null,
                      reviewFlags: ["missing_price"],
                    });
                    void persist(next);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Add item
                </Button>
              </Card>
            ))}

            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const next = structuredClone(draft);
                next.categories.push({
                  id: `cat-new-${Date.now()}`,
                  name: "New category",
                  items: [],
                });
                void persist(next);
              }}
            >
              <Plus className="w-4 h-4" />
              Add category
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void apply()} disabled={Boolean(busy)}>
                Apply Import
              </Button>
              <Button type="button" variant="secondary" onClick={() => void cancel()} disabled={Boolean(busy)}>
                Cancel Import
              </Button>
            </div>
            <p className="text-sm text-zinc-500">{confirmLabel} Existing items are not overwritten.</p>
          </>
        )}

        {record?.status === "APPLIED" && (
          <Card className="p-5 space-y-2">
            <p>Import applied.</p>
            <p className="text-sm text-zinc-400">
              Created {record.appliedResult?.createdCategoryCount ?? 0} categories and{" "}
              {record.appliedResult?.createdItemCount ?? 0} items.
            </p>
            <Link href="/admin/menu">
              <Button type="button">Back to menu</Button>
            </Link>
          </Card>
        )}

        {record?.status === "CANCELLED" && (
          <Card className="p-5">
            <p>This import was cancelled. The live menu was not changed.</p>
          </Card>
        )}
      </main>
    </div>
  );
}
