import { useCallback } from "react";
import { usePagedExpandableList } from "@/hooks/usePagedExpandableList";

type SearchableRestaurant = { id: string; name: string; slug?: string };

export function useRestaurantSearch<T extends SearchableRestaurant>(restaurants: T[]) {
  const getId = useCallback((item: T) => item.id, []);
  const getSearchText = useCallback((item: T) => `${item.name} ${item.slug ?? ""}`, []);
  return usePagedExpandableList(restaurants, { getId, getSearchText });
}
