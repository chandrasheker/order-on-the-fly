import { useMemo, useState } from "react";

type SearchableRestaurant = { id: string; name: string; slug: string };

export function useRestaurantSearch<T extends SearchableRestaurant>(restaurants: T[]) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return restaurants;
    return restaurants.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        r.slug.toLowerCase().includes(query),
    );
  }, [restaurants, search]);

  const isExpanded = (id: string) => Boolean(expanded[id]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    setExpanded(Object.fromEntries(filtered.map((r) => [r.id, true])));
  };

  const collapseAll = () => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const r of filtered) delete next[r.id];
      return next;
    });
  };

  return {
    search,
    setSearch,
    filtered,
    isExpanded,
    toggleExpanded,
    expandAll,
    collapseAll,
    total: restaurants.length,
    showing: filtered.length,
  };
}
