function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function safeAuditDiff(before: unknown, after: unknown): Record<string, { from: unknown; to: unknown }> {
  const left = isPlainObject(before) ? before : {};
  const right = isPlainObject(after) ? after : {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of keys) {
    const from = left[key];
    const to = right[key];
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    diff[key] = { from: from ?? null, to: to ?? null };
  }
  return diff;
}
