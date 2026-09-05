import { fromPaise } from "@/lib/money";
import { formatCurrency } from "@/lib/utils";

export function formatInrFromPaise(paise: number) {
  const rupees = fromPaise(paise);
  const abs = Math.abs(rupees);
  if (abs >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `₹${(rupees / 100_000).toFixed(1)}L`;
  return formatCurrency(rupees);
}

export function formatExactInrFromPaise(paise: number) {
  return formatCurrency(fromPaise(paise));
}

export function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function percentile(values: number[], p: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

export function durationStats(values: number[]) {
  return {
    average: average(values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    worst: values.length ? Math.max(...values) : null,
    sampleCount: values.length,
  };
}
