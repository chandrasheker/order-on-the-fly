"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { LIST_PAGE_SIZES, type ListPageSize } from "@/lib/paged-list";

interface PlatformRestaurantToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  matching: number;
  total: number;
  showingFrom: number;
  showingTo: number;
  pageSize: ListPageSize | number;
  onPageSizeChange: (value: ListPageSize) => void;
  page: number;
  pageCount: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  noun?: string;
  placeholder?: string;
  expandable?: boolean;
}

export function PlatformRestaurantToolbar({
  search,
  onSearchChange,
  matching,
  total,
  showingFrom,
  showingTo,
  pageSize,
  onPageSizeChange,
  page,
  pageCount,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onExpandAll,
  onCollapseAll,
  noun = "restaurant",
  placeholder,
  expandable = true,
}: PlatformRestaurantToolbarProps) {
  const plural = `${noun}${total === 1 ? "" : "s"}`;
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder ?? `Search ${plural} by name or slug…`}
          className="pl-10"
          aria-label={`Search ${plural}`}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          {matching === 0
            ? search.trim()
              ? `No ${plural} match this search`
              : `No ${plural} yet`
            : `Showing ${showingFrom}–${showingTo} of ${matching}${
                search.trim() ? ` matching ${plural}` : ` ${plural}`
              }${search.trim() ? ` (${total} total)` : ""}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1" role="group" aria-label={`Rows per page for ${plural}`}>
            {LIST_PAGE_SIZES.map((size) => (
              <Button
                key={size}
                type="button"
                size="sm"
                variant={pageSize === size ? "primary" : "secondary"}
                onClick={() => onPageSizeChange(size)}
              >
                {size}
              </Button>
            ))}
            <span className="text-xs text-zinc-500 pl-1">at once</span>
          </div>
          {expandable && onExpandAll && onCollapseAll && total > 0 && (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={onExpandAll}>
                <ChevronDown className="w-4 h-4" /> Expand all
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={onCollapseAll}>
                <ChevronUp className="w-4 h-4" /> Collapse all
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canPrev}
          onClick={onPrev}
          aria-label={`Previous ${noun} page`}
        >
          <ChevronLeft className="w-4 h-4" /> Previous
        </Button>
        <p className="text-xs text-zinc-500">
          Page {pageCount === 0 ? 0 : page + 1} of {pageCount}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canNext}
          onClick={onNext}
          aria-label={`Next ${noun} page`}
        >
          Next <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export function PlatformPagedListFrame({
  canPrev,
  canNext,
  onPrev,
  onNext,
  noun,
  children,
}: {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  noun: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-stretch gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!canPrev}
        onClick={onPrev}
        aria-label={`Previous ${noun} page`}
        className="self-center shrink-0 px-2"
      >
        <ChevronLeft className="w-5 h-5" />
      </Button>
      <div className="min-w-0 flex-1">{children}</div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!canNext}
        onClick={onNext}
        aria-label={`Next ${noun} page`}
        className="self-center shrink-0 px-2"
      >
        <ChevronRight className="w-5 h-5" />
      </Button>
    </div>
  );
}

export function PlatformCollapsibleSection({
  title,
  countLabel,
  open,
  onToggle,
  children,
}: {
  title: string;
  countLabel?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 text-left w-full min-w-0"
        aria-expanded={open}
      >
        {open ? (
          <ChevronUp className="w-5 h-5 text-zinc-400 shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-zinc-400 shrink-0" />
        )}
        <h2 className="text-lg font-semibold">{title}</h2>
        {countLabel ? <span className="text-sm text-zinc-500 truncate">{countLabel}</span> : null}
      </button>
      {open ? children : null}
    </section>
  );
}
