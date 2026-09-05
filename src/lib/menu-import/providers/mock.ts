import { parseMenuImportDraft } from "@/lib/menu-import/draft";
import { parsePriceFromLine } from "@/lib/menu-import/prices";
import type { MenuImportDraft, MenuImportExtractInput, MenuImportExtractor } from "@/lib/menu-import/types";

export type MockExtractInvocation = {
  mode: "text" | "image" | "mixed";
  pageCount: number;
  textPages: number;
  imagePages: number;
};

let lastInvocation: MockExtractInvocation | null = null;
let nextDraft: MenuImportDraft | unknown | null = null;
let nextError: Error | null = null;

export function getLastMockExtractInvocation() {
  return lastInvocation;
}

export function setNextMockExtractDraft(draft: MenuImportDraft | unknown | null) {
  nextDraft = draft;
}

export function setNextMockExtractError(error: Error | null) {
  nextError = error;
}

export function resetMockMenuImportExtractor() {
  lastInvocation = null;
  nextDraft = null;
  nextError = null;
}

function isCategoryLine(line: string) {
  if (!line || line.length > 40) return false;
  if (parsePriceFromLine(line).paise != null || parsePriceFromLine(line).ambiguous) return false;
  if (/[.!?]/.test(line)) return false;
  const letters = (line.match(/[A-Za-z]/g) ?? []).length;
  return letters >= 3;
}

function parseTextMenu(pages: MenuImportExtractInput["pages"]): MenuImportDraft {
  const categories: MenuImportDraft["categories"] = [];
  let current: MenuImportDraft["categories"][number] | null = null;

  const ensureCategory = (name: string, sourcePage: number) => {
    const existing = categories.find((category) => category.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      current = existing;
      return existing;
    }
    current = { id: `cat-p${sourcePage}-${categories.length + 1}`, name, items: [] };
    categories.push(current);
    return current;
  };

  for (const page of pages) {
    const lines = String(page.text ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      const price = parsePriceFromLine(line);
      if (price.paise != null || price.ambiguous) {
        if (!current) ensureCategory("Imported", page.pageNumber);
        let name = line.replace(/(?:₹|rs\.?|inr|rupees?)\s*\d[\d,]*(?:\.\d{1,2})?/gi, "").trim();
        if (price.paise != null) {
          const rupees = String(price.paise / 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const rupeesFixed = (price.paise / 100).toFixed(2).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          name = name.replace(new RegExp(`(?:\\s|^)(?:${rupees}|${rupeesFixed})\\s*$`), "").trim();
        }
        name = name.replace(/[-–—:/]+$/g, "").trim();
        if (!name) continue;
        current!.items.push({
          id: `item-p${page.pageNumber}-${current!.items.length + 1}`,
          name,
          description: null,
          pricePaise: price.paise,
          priceAmbiguous: price.ambiguous,
          isVeg: /paneer|veg(?!etable)|dal|dosa|idli|aloo/i.test(name)
            ? true
            : /chicken|mutton|fish|prawn|egg|non[-\s]?veg/i.test(name)
              ? false
              : null,
          sourcePage: page.pageNumber,
          reviewFlags: price.ambiguous ? ["ambiguous_price"] : [],
        });
        continue;
      }
      if (isCategoryLine(line)) {
        ensureCategory(line.replace(/[:.-]+$/g, "").trim(), page.pageNumber);
      }
    }
  }

  return parseMenuImportDraft({ categories });
}

const CANNED_IMAGE_DRAFT: MenuImportDraft = {
  categories: [
    {
      id: "cat-mock-starters",
      name: "Starters",
      items: [
        {
          id: "item-mock-c65",
          name: "Chicken 65",
          description: null,
          pricePaise: 24900,
          priceAmbiguous: false,
          isVeg: false,
          sourcePage: 1,
        },
        {
          id: "item-mock-p65",
          name: "Paneer 65",
          description: null,
          pricePaise: 21900,
          priceAmbiguous: false,
          isVeg: true,
          sourcePage: 1,
        },
      ],
    },
    {
      id: "cat-mock-biryani",
      name: "Biryani",
      items: [
        {
          id: "item-mock-cdb",
          name: "Chicken Dum Biryani",
          description: null,
          pricePaise: 31900,
          priceAmbiguous: false,
          isVeg: false,
          sourcePage: 2,
        },
        {
          id: "item-mock-vb",
          name: "Veg Biryani",
          description: null,
          pricePaise: 24900,
          priceAmbiguous: false,
          isVeg: true,
          sourcePage: 2,
        },
      ],
    },
  ],
};

export class MockMenuImportExtractor implements MenuImportExtractor {
  async extractMenu(input: MenuImportExtractInput): Promise<MenuImportDraft> {
    const textPages = input.pages.filter((page) => page.kind === "text").length;
    const imagePages = input.pages.filter((page) => page.kind === "image").length;
    lastInvocation = {
      mode: textPages && imagePages ? "mixed" : imagePages ? "image" : "text",
      pageCount: input.pages.length,
      textPages,
      imagePages,
    };
    if (nextError) {
      const error = nextError;
      nextError = null;
      throw error;
    }
    if (nextDraft != null) {
      const draft = nextDraft;
      nextDraft = null;
      return parseMenuImportDraft(draft);
    }
    if (textPages > 0 && imagePages === 0) {
      return parseTextMenu(input.pages);
    }
    if (textPages > 0) {
      const fromText = parseTextMenu(input.pages.filter((page) => page.kind === "text"));
      if (fromText.categories.length > 0) return fromText;
    }
    return parseMenuImportDraft(CANNED_IMAGE_DRAFT);
  }
}
