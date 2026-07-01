"use client";

import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { Button, Input } from "@/components/ui";

interface PlatformRestaurantToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  showing: number;
  total: number;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  placeholder?: string;
}

export function PlatformRestaurantToolbar({
  search,
  onSearchChange,
  showing,
  total,
  onExpandAll,
  onCollapseAll,
  placeholder = "Search restaurants by name or slug…",
}: PlatformRestaurantToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="pl-10"
          aria-label="Search restaurants"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          {search.trim()
            ? `Showing ${showing} of ${total} restaurant${total === 1 ? "" : "s"}`
            : `${total} restaurant${total === 1 ? "" : "s"}`}
        </p>
        {total > 0 && (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onExpandAll}>
              <ChevronDown className="w-4 h-4" /> Expand all
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onCollapseAll}>
              <ChevronUp className="w-4 h-4" /> Collapse all
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
