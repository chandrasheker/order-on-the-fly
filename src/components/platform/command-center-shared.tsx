"use client";

import { Fragment, useCallback, useMemo } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { PlatformPagedListFrame, PlatformRestaurantToolbar } from "@/components/platform/PlatformRestaurantToolbar";
import { usePagedExpandableList } from "@/hooks/usePagedExpandableList";
import { formatDurationMs } from "@/platform/command-center/classify";
import { formatExactInrFromPaise, formatInrFromPaise } from "@/platform/command-center/format";
import { formatTrendPercent } from "@/platform/command-center/time-range";
import type { RestaurantCommandRow, TrendValue } from "@/platform/command-center/types";
import { cn } from "@/lib/utils";

export const TIME_RANGE_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "custom", label: "Custom" },
] as const;

export function healthTone(level: string) {
  if (level === "OVERWHELMED" || level === "OFFLINE" || level === "ATTENTION") return "bg-red-500/15 text-red-300 border-red-500/30";
  if (level === "HIGH" || level === "DEGRADED" || level === "BUSY") return "bg-amber-500/15 text-amber-200 border-amber-500/30";
  if (level === "NEVER" || level === "HEALTHY" || level === "NORMAL") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  return "bg-white/5 text-zinc-300 border-white/10";
}

export function HealthBadge({ level, children }: { level: string; children?: React.ReactNode }) {
  return <Badge className={healthTone(level)}>{children ?? level}</Badge>;
}

export function Trend({ value, invert }: { value?: TrendValue; invert?: boolean }) {
  if (!value) return <span className="text-zinc-500">—</span>;
  const text = formatTrendPercent(value.percent);
  const up = (value.percent ?? 0) > 0;
  const good = invert ? !up : up;
  return (
    <span className={value.percent == null ? "text-zinc-500" : good ? "text-emerald-300" : "text-red-300"}>
      {text}
    </span>
  );
}

export function TimeRangeBar({
  range,
  from,
  to,
  onRange,
  onCustom,
}: {
  range: string;
  from: string;
  to: string;
  onRange: (value: string) => void;
  onCustom: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {TIME_RANGE_OPTIONS.map((option) => (
        <Button
          key={option.id}
          type="button"
          size="sm"
          variant={range === option.id ? "primary" : "secondary"}
          onClick={() => onRange(option.id)}
        >
          {option.label}
        </Button>
      ))}
      {range === "custom" && (
        <>
          <Input
            type="date"
            value={from}
            onChange={(e) => onCustom(e.target.value, to)}
            aria-label="From date"
            className="w-auto py-1.5"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => onCustom(from, e.target.value)}
            aria-label="To date"
            className="w-auto py-1.5"
          />
        </>
      )}
    </div>
  );
}

export function SummaryCard({
  label,
  value,
  hint,
  href,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  warn?: boolean;
}) {
  const inner = (
    <Card className={cn("p-4 h-full", warn && "border-amber-500/40")}>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {hint && <p className="text-xs text-zinc-500 mt-1">{hint}</p>}
    </Card>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{inner}</Link> : inner;
}

export function Money({ paise, compact = true }: { paise: number; compact?: boolean }) {
  return <>{compact ? formatInrFromPaise(paise) : formatExactInrFromPaise(paise)}</>;
}

export function AttentionList({ row }: { row: RestaurantCommandRow }) {
  if (!row.needsAttention) return <span className="text-zinc-500">None</span>;
  return (
    <ul className="space-y-1">
      {row.attention.map((item) => (
        <li key={`${item.subsystem}-${item.detail}`} className="text-xs">
          <HealthBadge level={item.level}>{item.subsystem} {item.level}</HealthBadge>
          <span className="ml-2 text-zinc-400">{item.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function RestaurantHealthTable({
  rows,
  sort,
  onSort,
  filter,
  showTenant,
}: {
  rows: RestaurantCommandRow[];
  sort: string;
  onSort: (key: string) => void;
  filter: string;
  showTenant?: boolean;
}) {
  const scoped = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (filter === "attention") return row.needsAttention;
      if (filter === "kitchen") return row.kitchen.load.level === "HIGH" || row.kitchen.load.level === "OVERWHELMED";
      if (filter === "service") return row.service.load.level === "HIGH" || row.service.load.level === "BUSY";
      if (filter === "payments") return row.money.health.level === "ATTENTION";
      if (filter === "printing") return row.printing.health.level === "DEGRADED" || row.printing.health.level === "OFFLINE";
      if (filter === "errors") return row.reliability.health.level === "ATTENTION";
      return true;
    });
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "orders":
          return b.period.orders - a.period.orders;
        case "revenue":
          return b.revenue.netCapturedPaise - a.revenue.netCapturedPaise;
        case "sla":
          return (a.kitchen.sla.onTimePercent ?? 101) - (b.kitchen.sla.onTimePercent ?? 101);
        case "overdue":
          return b.current.overdue - a.current.overdue;
        case "serving":
          return (b.service.orderToServed.average ?? 0) - (a.service.orderToServed.average ?? 0);
        case "errors":
          return b.reliability.failedRequests - a.reliability.failedRequests;
        default:
          return a.restaurantName.localeCompare(b.restaurantName);
      }
    });
  }, [filter, rows, sort]);

  const getId = useCallback((row: RestaurantCommandRow) => row.restaurantId, []);
  const getSearchText = useCallback(
    (row: RestaurantCommandRow) => `${row.restaurantName} ${row.tenantName}`,
    [],
  );
  const list = usePagedExpandableList(scoped, { getId, getSearchText });
  const colSpan = showTenant ? 16 : 15;

  const header = (key: string, label: string) => (
    <button type="button" className="text-left hover:text-white" onClick={() => onSort(key)}>
      {label}
      {sort === key ? " ↓" : ""}
    </button>
  );

  return (
    <div className="space-y-3">
      <PlatformRestaurantToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        matching={list.matchingCount}
        total={list.total}
        showingFrom={list.showingFrom}
        showingTo={list.showingTo}
        pageSize={list.pageSize}
        onPageSizeChange={list.setPageSize}
        page={list.page}
        pageCount={list.pageCount}
        canPrev={list.canPrev}
        canNext={list.canNext}
        onPrev={list.goPrev}
        onNext={list.goNext}
        onExpandAll={list.expandAll}
        onCollapseAll={list.collapseAll}
        noun="restaurant"
        placeholder={showTenant ? "Search restaurants or tenants…" : "Search restaurants…"}
      />
      <PlatformPagedListFrame
        canPrev={list.canPrev}
        canNext={list.canNext}
        onPrev={list.goPrev}
        onNext={list.goNext}
        noun="restaurant"
      >
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left w-10"> </th>
                {showTenant && <th className="px-3 py-2 text-left">Tenant</th>}
                <th className="px-3 py-2 text-left">{header("name", "Restaurant")}</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">{header("orders", "Orders")}</th>
                <th className="px-3 py-2 text-left">{header("revenue", "Revenue")}</th>
                <th className="px-3 py-2 text-left">Active tables</th>
                <th className="px-3 py-2 text-left">Active staff</th>
                <th className="px-3 py-2 text-left">Kitchen backlog</th>
                <th className="px-3 py-2 text-left">{header("overdue", "Overdue")}</th>
                <th className="px-3 py-2 text-left">{header("sla", "On-time %")}</th>
                <th className="px-3 py-2 text-left">{header("serving", "Avg serving")}</th>
                <th className="px-3 py-2 text-left">Service</th>
                <th className="px-3 py-2 text-left">Payments</th>
                <th className="px-3 py-2 text-left">Printing</th>
                <th className="px-3 py-2 text-left">{header("errors", "Errors")}</th>
              </tr>
            </thead>
            <tbody>
              {list.visible.map((row) => {
                const open = list.isExpanded(row.restaurantId);
                return (
                  <Fragment key={row.restaurantId}>
                    <tr className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => list.toggleExpanded(row.restaurantId)}
                          aria-expanded={open}
                          aria-label={`${open ? "Collapse" : "Expand"} ${row.restaurantName}`}
                          className="text-zinc-400 hover:text-white"
                        >
                          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                      {showTenant && <td className="px-3 py-2 text-zinc-400">{row.tenantName}</td>}
                      <td className="px-3 py-2">
                        <Link href={row.hrefs.overview} className="text-violet-200 hover:text-white font-medium">
                          {row.restaurantName}
                        </Link>
                        {row.needsAttention && (
                          <div className="mt-1 text-xs text-amber-300">
                            {row.attention.map((item) => item.subsystem).join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <HealthBadge level={row.status === "active" ? "HEALTHY" : row.status === "disabled" ? "ATTENTION" : "NORMAL"}>
                          {row.status}
                        </HealthBadge>
                      </td>
                      <td className="px-3 py-2">{row.period.orders}</td>
                      <td className="px-3 py-2"><Money paise={row.revenue.netCapturedPaise} /></td>
                      <td className="px-3 py-2">{row.current.activeTables}</td>
                      <td className="px-3 py-2">{row.current.activeStaff}</td>
                      <td className="px-3 py-2">{row.current.kitchenBacklog}</td>
                      <td className="px-3 py-2">{row.current.overdue}</td>
                      <td className="px-3 py-2">
                        <Link href={row.hrefs.sla} className="hover:text-white">
                          {row.kitchen.sla.label}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{formatDurationMs(row.service.orderToServed.average)}</td>
                      <td className="px-3 py-2"><HealthBadge level={row.service.load.level} /></td>
                      <td className="px-3 py-2">
                        <Link href={row.hrefs.financial}><HealthBadge level={row.money.health.level} /></Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={row.hrefs.printingAmbiguous}><HealthBadge level={row.printing.health.level} /></Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={row.hrefs.errors} className="hover:text-white">
                          {row.reliability.failedRequests}
                        </Link>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-t border-white/5 bg-white/[0.03]">
                        <td colSpan={colSpan} className="px-4 py-3">
                          <AttentionList row={row} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {list.matchingCount === 0 && (
                <tr>
                  <td colSpan={colSpan} className="px-3 py-8 text-center text-zinc-500">
                    No restaurants match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PlatformPagedListFrame>
    </div>
  );
}

export function FilterPills({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "px-3 py-1.5 rounded-xl text-sm border",
            value === option.id ? "bg-violet-500/20 border-violet-500/40 text-violet-100" : "bg-white/5 border-white/10 text-zinc-400",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function RangeSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Time range">
      {TIME_RANGE_OPTIONS.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
