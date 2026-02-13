export function quoteSqlStrings(values) {
  return values.map((value) => `'${String(value).replace(/'/g, "''")}'`).join(", ");
}

export function arrowTableToObjects(table) {
  if (!table) return [];
  return Array.from(table, (row) => ({ ...row }));
}

export function formatMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00 ms";
  return `${n.toFixed(2)} ms`;
}

export function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} GB`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)} KB`;
  return `${Math.round(n)} B`;
}

export function normalizeRunLabel(runName) {
  if (!runName) return "unknown";
  return String(runName).replace(/_\d{8}_\d{6}$/, "");
}

export function dedupe(values) {
  return Array.from(new Set(values));
}
