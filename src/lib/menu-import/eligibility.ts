import type { MenuImportDraft, MenuImportDraftItem } from "@/lib/menu-import/types";

export function isDefaultSkippedDuplicate(item: MenuImportDraftItem): boolean {
  return Boolean(item.possibleDuplicate) && item.skipOnApply !== false;
}

export function isEligibleApplyItem(item: MenuImportDraftItem): boolean {
  return (
    item.name.trim().length > 0 &&
    item.pricePaise != null &&
    Number.isInteger(item.pricePaise) &&
    item.pricePaise >= 0 &&
    !item.priceAmbiguous &&
    !isDefaultSkippedDuplicate(item)
  );
}

export function applyPreviewFromDraft(draft: MenuImportDraft | { categories: MenuImportDraft["categories"] } | null | undefined) {
  if (!draft) {
    return { categoryCount: 0, itemCount: 0, duplicateCount: 0, incompleteCount: 0 };
  }
  let itemCount = 0;
  let duplicateCount = 0;
  let incompleteCount = 0;
  for (const category of draft.categories) {
    for (const item of category.items) {
      if (isDefaultSkippedDuplicate(item)) {
        duplicateCount += 1;
        continue;
      }
      if (!item.name.trim() || item.pricePaise == null || item.priceAmbiguous) {
        incompleteCount += 1;
        continue;
      }
      itemCount += 1;
    }
  }
  return {
    categoryCount: draft.categories.filter((category) =>
      category.items.some((item) => isEligibleApplyItem(item)),
    ).length,
    itemCount,
    duplicateCount,
    incompleteCount,
  };
}
