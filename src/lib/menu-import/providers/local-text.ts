import { parseMenuImportDraft } from "@/lib/menu-import/draft";
import { parsePriceFromLine } from "@/lib/menu-import/prices";
import type { MenuImportDraft, MenuImportExtractInput, MenuImportExtractor } from "@/lib/menu-import/types";

function isCategoryLine(line: string) {
  if (!line || line.length > 40) return false;
  if (parsePriceFromLine(line).paise != null || parsePriceFromLine(line).ambiguous) return false;
  if (/[.!?]/.test(line)) return false;
  const letters = (line.match(/[A-Za-z]/g) ?? []).length;
  return letters >= 3;
}

export function parseTextMenuPages(pages: MenuImportExtractInput["pages"]): MenuImportDraft {
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

export class LocalTextMenuImportExtractor implements MenuImportExtractor {
  async extractMenu(input: MenuImportExtractInput): Promise<MenuImportDraft> {
    return parseTextMenuPages(input.pages.filter((page) => page.kind === "text" || page.text));
  }
}
