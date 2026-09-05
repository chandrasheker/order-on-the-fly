import { useMemo, useState } from "react";
import {
  filterBySearch,
  normalizeListPageSize,
  paginateItems,
  type ListPageSize,
} from "@/lib/paged-list";

export function usePagedExpandableList<T>(
  items: T[],
  {
    getId,
    getSearchText,
  }: {
    getId: (item: T) => string;
    getSearchText: (item: T) => string;
  },
) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState<ListPageSize>(10);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const matching = useMemo(
    () => filterBySearch(items, search, getSearchText),
    [getSearchText, items, search],
  );

  const paging = paginateItems(matching, page, pageSize);

  const setPageSize = (value: ListPageSize) => {
    setPageSizeState(normalizeListPageSize(value));
    setPage(0);
  };

  const setSearchAndReset = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const isExpanded = (id: string) => Boolean(expanded[id]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    setExpanded(Object.fromEntries(matching.map((item) => [getId(item), true])));
  };

  const collapseAll = () => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const item of matching) delete next[getId(item)];
      return next;
    });
  };

  return {
    search,
    setSearch: setSearchAndReset,
    page: paging.page,
    setPage,
    pageSize,
    setPageSize,
    pageCount: paging.pageCount,
    canPrev: paging.canPrev,
    canNext: paging.canNext,
    goPrev: () => setPage((current) => Math.max(0, Math.min(current, paging.pageCount - 1) - 1)),
    goNext: () => setPage((current) => Math.min(paging.pageCount - 1, current + 1)),
    matching,
    filtered: matching,
    visible: paging.visible,
    isExpanded,
    toggleExpanded,
    expandAll,
    collapseAll,
    total: items.length,
    matchingCount: matching.length,
    showing: matching.length,
    showingFrom: paging.showingFrom,
    showingTo: paging.showingTo,
  };
}
