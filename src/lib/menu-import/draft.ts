import { randomUUID } from "node:crypto";
import { z } from "zod";
import { slugify } from "@/lib/utils";
import { parsePriceFromLine, rupeesStringToPaise } from "@/lib/menu-import/prices";
import type { MenuImportDraft, MenuImportDraftCategory, MenuImportDraftItem } from "@/lib/menu-import/types";

const confidenceSchema = z
  .object({
    name: z.number().min(0).max(1).optional(),
    price: z.number().min(0).max(1).optional(),
  })
  .optional();

const itemSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  pricePaise: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
  priceText: z.string().max(80).nullable().optional(),
  priceAmbiguous: z.boolean().optional(),
  isVeg: z.boolean().nullable().optional(),
  prepTimeMinutes: z.number().int().min(1).max(240).optional(),
  skipOnApply: z.boolean().optional(),
  confidence: confidenceSchema,
  sourcePage: z.number().int().min(1).max(20).optional(),
  reviewFlags: z.array(z.string().max(40)).max(12).optional(),
  possibleDuplicate: z.boolean().optional(),
});

const categorySchema = z.object({
  id: z.string().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(120),
  items: z.array(itemSchema).max(300),
});

export const menuImportDraftSchema = z.object({
  categories: z.array(categorySchema).max(80),
});

export function normalizeMenuLabel(name: string) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function menuLabelsMatch(a: string, b: string) {
  const left = normalizeMenuLabel(a);
  const right = normalizeMenuLabel(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const leftSlug = slugify(a);
  const rightSlug = slugify(b);
  return Boolean(leftSlug && rightSlug && leftSlug === rightSlug);
}

function nextId(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function normalizeItem(raw: z.infer<typeof itemSchema>): MenuImportDraftItem {
  const flags = new Set(raw.reviewFlags ?? []);
  let pricePaise = raw.pricePaise ?? null;
  let priceAmbiguous = Boolean(raw.priceAmbiguous);

  if (raw.priceText) {
    const parsed = parsePriceFromLine(raw.priceText);
    if (parsed.ambiguous) {
      priceAmbiguous = true;
      if (pricePaise == null) pricePaise = null;
      flags.add("ambiguous_price");
    } else if (pricePaise == null && parsed.paise != null) {
      pricePaise = parsed.paise;
    } else if (pricePaise == null) {
      const direct = rupeesStringToPaise(raw.priceText.replace(/[₹,\s]/g, "").replace(/^(rs\.?|inr)/i, ""));
      if (direct != null) pricePaise = direct;
    }
  }

  if (pricePaise != null && !Number.isInteger(pricePaise)) {
    pricePaise = null;
    priceAmbiguous = true;
    flags.add("ambiguous_price");
  }
  if (pricePaise == null) flags.add("missing_price");
  if (priceAmbiguous) flags.add("ambiguous_price");
  if (raw.isVeg == null) flags.add("veg_unknown");

  return {
    id: raw.id && raw.id.length <= 80 ? raw.id : nextId("item"),
    name: raw.name.trim(),
    description: raw.description?.trim() ? raw.description.trim() : null,
    pricePaise,
    priceAmbiguous,
    isVeg: raw.isVeg ?? null,
    ...(raw.prepTimeMinutes ? { prepTimeMinutes: raw.prepTimeMinutes } : {}),
    ...(raw.skipOnApply != null ? { skipOnApply: raw.skipOnApply } : {}),
    ...(raw.confidence ? { confidence: raw.confidence } : {}),
    ...(raw.sourcePage ? { sourcePage: raw.sourcePage } : {}),
    reviewFlags: [...flags],
  };
}

export function parseMenuImportDraft(input: unknown): MenuImportDraft {
  const parsed = menuImportDraftSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("INVALID_DRAFT");
  }
  return {
    categories: parsed.data.categories.map((category) => ({
      id: category.id && category.id.length <= 80 ? category.id : nextId("cat"),
      name: category.name.trim(),
      items: category.items.map(normalizeItem),
    })),
  };
}

export function emptyMenuImportDraft(): MenuImportDraft {
  return { categories: [] };
}

export function draftItemCount(draft: MenuImportDraft | null | undefined) {
  return draft?.categories.reduce((sum, category) => sum + category.items.length, 0) ?? 0;
}

export function annotateDraftDuplicates(
  draft: MenuImportDraft,
  live: Array<{ categoryName: string; itemName: string }>,
): MenuImportDraft {
  return {
    categories: draft.categories.map((category) => ({
      ...category,
      items: category.items.map((item) => {
        const duplicate = live.some(
          (row) => menuLabelsMatch(row.categoryName, category.name) && menuLabelsMatch(row.itemName, item.name),
        );
        const flags = new Set(item.reviewFlags ?? []);
        if (duplicate) flags.add("possible_duplicate");
        else flags.delete("possible_duplicate");
        return {
          ...item,
          possibleDuplicate: duplicate,
          skipOnApply: duplicate ? item.skipOnApply !== false : item.skipOnApply,
          reviewFlags: [...flags],
        };
      }),
    })),
  };
}

export { applyPreviewFromDraft } from "@/lib/menu-import/eligibility";

export function serializeDraft(draft: MenuImportDraft) {
  const cleaned: MenuImportDraft = {
    categories: draft.categories.map((category) => ({
      id: category.id,
      name: category.name,
      items: category.items.map((item) => {
        const copy: MenuImportDraftItem = {
          id: item.id,
          name: item.name,
          description: item.description,
          pricePaise: item.pricePaise,
          priceAmbiguous: item.priceAmbiguous,
          isVeg: item.isVeg,
          reviewFlags: item.reviewFlags,
        };
        if (item.prepTimeMinutes) copy.prepTimeMinutes = item.prepTimeMinutes;
        if (item.skipOnApply != null) copy.skipOnApply = item.skipOnApply;
        if (item.confidence) copy.confidence = item.confidence;
        if (item.sourcePage) copy.sourcePage = item.sourcePage;
        return copy;
      }),
    })),
  };
  return JSON.stringify(cleaned);
}

export function parseStoredDraft(json: string | null | undefined): MenuImportDraft | null {
  if (!json) return null;
  try {
    return parseMenuImportDraft(JSON.parse(json));
  } catch {
    return null;
  }
}

export function createBlankDraftItem(partial?: Partial<MenuImportDraftItem>): MenuImportDraftItem {
  return {
    id: nextId("item"),
    name: partial?.name ?? "",
    description: partial?.description ?? null,
    pricePaise: partial?.pricePaise ?? null,
    priceAmbiguous: partial?.priceAmbiguous ?? false,
    isVeg: partial?.isVeg ?? null,
    reviewFlags: partial?.reviewFlags ?? ["missing_price"],
    sourcePage: partial?.sourcePage,
  };
}

export function createBlankDraftCategory(name = "New category"): MenuImportDraftCategory {
  return { id: nextId("cat"), name, items: [] };
}
