export const LIST_PAGE_SIZES = [10, 50, 100] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZES)[number];

export function normalizeListPageSize(value: number | string | null | undefined): ListPageSize {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (parsed === 50 || parsed === 100) return parsed;
  return 10;
}

export function filterBySearch<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => getText(item).toLowerCase().includes(needle));
}

export function paginateItems<T>(items: T[], page: number, pageSize: ListPageSize) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = items.length === 0 ? 0 : safePage * pageSize;
  const visible = items.slice(start, start + pageSize);
  return {
    pageCount,
    page: safePage,
    visible,
    showingFrom: items.length === 0 ? 0 : start + 1,
    showingTo: start + visible.length,
    canPrev: safePage > 0,
    canNext: safePage < pageCount - 1,
  };
}
