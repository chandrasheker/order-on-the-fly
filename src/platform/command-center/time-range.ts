import { format } from "date-fns";

export const TIME_RANGE_PRESETS = ["today", "yesterday", "7d", "30d", "custom"] as const;
export type TimeRangePreset = (typeof TIME_RANGE_PRESETS)[number];

export type ResolvedTimeRange = {
  preset: TimeRangePreset;
  from: Date;
  to: Date;
  fromDate: string;
  toDate: string;
  previousFrom: Date;
  previousTo: Date;
  previousFromDate: string;
  previousToDate: string;
  label: string;
  hours: number;
  isCurrentDay: boolean;
};

function dateString(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function parseBoundary(value: string | null | undefined, endOfDay: boolean) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return endOfDay
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isTimeRangePreset(value: string | null | undefined): value is TimeRangePreset {
  return TIME_RANGE_PRESETS.includes((value ?? "") as TimeRangePreset);
}

export function resolveTimeRange(input?: {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): ResolvedTimeRange {
  const now = input?.now ?? new Date();
  const todayStart = startOfLocalDay(now);
  const preset = isTimeRangePreset(input?.preset) ? input.preset : "today";

  let from = todayStart;
  let to = now;
  let label = "Today";
  let resolvedPreset: TimeRangePreset = preset;

  if (preset === "yesterday") {
    const yesterday = addDays(todayStart, -1);
    from = startOfLocalDay(yesterday);
    to = endOfLocalDay(yesterday);
    label = "Yesterday";
  } else if (preset === "7d") {
    from = startOfLocalDay(addDays(todayStart, -6));
    to = now;
    label = "Last 7 days";
  } else if (preset === "30d") {
    from = startOfLocalDay(addDays(todayStart, -29));
    to = now;
    label = "Last 30 days";
  } else if (preset === "custom") {
    const customFrom = parseBoundary(input?.from, false);
    const customTo = parseBoundary(input?.to, true);
    if (customFrom && customTo && customFrom.getTime() <= customTo.getTime()) {
      from = customFrom;
      to = customTo;
      label = `${dateString(from)} → ${dateString(to)}`;
    } else {
      resolvedPreset = "today";
      from = todayStart;
      to = now;
      label = "Today";
    }
  }

  const durationMs = Math.max(1, to.getTime() - from.getTime());
  let previousFrom: Date;
  let previousTo: Date;
  if (resolvedPreset === "today") {
    const yesterdayStart = startOfLocalDay(addDays(todayStart, -1));
    previousFrom = yesterdayStart;
    previousTo = new Date(yesterdayStart.getTime() + (to.getTime() - from.getTime()));
  } else {
    previousTo = new Date(from.getTime() - 1);
    previousFrom = new Date(previousTo.getTime() - durationMs);
  }
  const hours = Math.max(durationMs / 3_600_000, 1 / 60);

  return {
    preset: resolvedPreset,
    from,
    to,
    fromDate: dateString(from),
    toDate: dateString(to),
    previousFrom,
    previousTo,
    previousFromDate: dateString(previousFrom),
    previousToDate: dateString(previousTo),
    label,
    hours,
    isCurrentDay: resolvedPreset === "today",
  };
}

export function trendPercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatTrendPercent(value: number | null) {
  if (value == null) return "—";
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}
